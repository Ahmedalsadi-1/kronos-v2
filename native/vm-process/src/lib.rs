// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

fn uses_drive(data: &[u8], drive: &[u8]) -> bool {
    let Some((count, data)) = data.split_at_checked(size_of::<i32>()) else {
        return false;
    };
    let argc = i32::from_ne_bytes(count.try_into().unwrap_or_default());
    let mut fields = data.split(|byte| *byte == 0);
    if argc < 3 || fields.next().is_none_or(|path| path.is_empty()) {
        return false;
    }

    // Darwin puts an executable path and NUL padding before argv, then appends env.
    let mut argv = fields.skip_while(|field| field.is_empty());
    argv.next();
    let mut previous_is_drive = false;
    let mut matched = false;
    for _ in 1..argc {
        let Some(argument) = argv.next() else {
            return false;
        };
        matched |= previous_is_drive && argument == drive;
        previous_is_drive = argument == b"-drive";
    }
    matched
}

#[cfg(target_os = "macos")]
mod macos {
    use super::uses_drive;
    use std::ffi::{c_char, c_double, c_int, c_uint, c_void};
    use std::io;
    use std::ptr::null_mut;

    type Env = *mut c_void;
    type Value = *mut c_void;
    type CallbackInfo = *mut c_void;

    const ESRCH: c_int = 3;
    const CTL_KERN: c_int = 1;
    const KERN_PROCARGS2: c_int = 49;
    const PROC_PIDPATHINFO_MAXSIZE: usize = 4096;
    const ARG_MAX: usize = 256 * 1024;

    unsafe extern "C" {
        fn proc_pidpath(pid: c_int, buffer: *mut c_void, size: c_uint) -> c_int;
        fn sysctl(
            name: *mut c_int,
            namelen: c_uint,
            old: *mut c_void,
            oldlen: *mut usize,
            new: *mut c_void,
            newlen: usize,
        ) -> c_int;
        fn kill(pid: c_int, signal: c_int) -> c_int;
        fn napi_get_cb_info(
            env: Env,
            info: CallbackInfo,
            argc: *mut usize,
            argv: *mut Value,
            this: *mut Value,
            data: *mut *mut c_void,
        ) -> c_int;
        fn napi_get_value_double(env: Env, value: Value, result: *mut c_double) -> c_int;
        fn napi_get_value_string_utf8(
            env: Env,
            value: Value,
            buffer: *mut c_char,
            size: usize,
            result: *mut usize,
        ) -> c_int;
        fn napi_get_boolean(env: Env, value: bool, result: *mut Value) -> c_int;
        fn napi_throw_error(env: Env, code: *const c_char, message: *const c_char) -> c_int;
        fn napi_create_function(
            env: Env,
            name: *const c_char,
            length: usize,
            callback: unsafe extern "C" fn(Env, CallbackInfo) -> Value,
            data: *mut c_void,
            result: *mut Value,
        ) -> c_int;
        fn napi_set_named_property(
            env: Env,
            object: Value,
            name: *const c_char,
            value: Value,
        ) -> c_int;
    }

    fn inspection_failed(pid: c_int) -> io::Result<bool> {
        let error = io::Error::last_os_error();
        // A stale PID file is routine. Permission or other inspection failures must
        // prevent starting a second VM or deleting a disk that might still be in use.
        if unsafe { kill(pid, 0) } == -1 && io::Error::last_os_error().raw_os_error() == Some(ESRCH)
        {
            return Ok(false);
        }
        Err(error)
    }

    fn is_managed_qemu(pid: c_int, drive: &[u8]) -> io::Result<bool> {
        let mut executable = [0u8; PROC_PIDPATHINFO_MAXSIZE];
        let len = unsafe {
            proc_pidpath(
                pid,
                executable.as_mut_ptr().cast(),
                executable.len() as c_uint,
            )
        };
        if len <= 0 {
            return inspection_failed(pid);
        }
        let executable = executable
            .split(|byte| *byte == 0)
            .next()
            .unwrap_or_default();
        if executable.rsplit(|byte| *byte == b'/').next() != Some(b"qemu-system-aarch64") {
            return Ok(false);
        }

        let mut mib = [CTL_KERN, KERN_PROCARGS2, pid];
        let mut data = vec![0u8; ARG_MAX];
        let mut size = ARG_MAX;
        let result = unsafe {
            sysctl(
                mib.as_mut_ptr(),
                mib.len() as c_uint,
                data.as_mut_ptr().cast(),
                &mut size,
                null_mut(),
                0,
            )
        };
        if result != 0 {
            return inspection_failed(pid);
        }
        let data = data
            .get(..size)
            .ok_or_else(|| io::Error::other("invalid process argument size"))?;
        Ok(uses_drive(data, drive))
    }

    unsafe extern "C" fn inspect(env: Env, info: CallbackInfo) -> Value {
        let mut args = [null_mut(); 2];
        let mut argc = args.len();
        let mut pid = 0.0;
        let mut drive = [0u8; PROC_PIDPATHINFO_MAXSIZE + 128];
        let mut length = 0;
        unsafe {
            if napi_get_cb_info(
                env,
                info,
                &mut argc,
                args.as_mut_ptr(),
                null_mut(),
                null_mut(),
            ) != 0
                || argc != 2
                || napi_get_value_double(env, args[0], &mut pid) != 0
                || !(2.0..=f64::from(c_int::MAX)).contains(&pid)
                || pid.fract() != 0.0
                || napi_get_value_string_utf8(env, args[1], null_mut(), 0, &mut length) != 0
                || length == 0
                || length >= drive.len()
                || napi_get_value_string_utf8(
                    env,
                    args[1],
                    drive.as_mut_ptr().cast(),
                    drive.len(),
                    &mut length,
                ) != 0
                || drive[..length].contains(&0)
            {
                napi_throw_error(
                    env,
                    null_mut(),
                    c"Invalid VM process identity request.".as_ptr(),
                );
                return null_mut();
            }

            match is_managed_qemu(pid as c_int, &drive[..length]) {
                Ok(matches) => {
                    let mut value = null_mut();
                    napi_get_boolean(env, matches, &mut value);
                    value
                }
                Err(error) => {
                    if let Ok(message) =
                        std::ffi::CString::new(format!("Unable to verify the VM process: {error}"))
                    {
                        napi_throw_error(env, null_mut(), message.as_ptr());
                    }
                    null_mut()
                }
            }
        }
    }

    #[unsafe(no_mangle)]
    unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Value) -> Value {
        let name = c"isManagedQemu";
        let mut function = null_mut();
        unsafe {
            if napi_create_function(
                env,
                name.as_ptr(),
                name.to_bytes().len(),
                inspect,
                null_mut(),
                &mut function,
            ) != 0
                || napi_set_named_property(env, exports, name.as_ptr(), function) != 0
            {
                return null_mut();
            }
        }
        exports
    }
}

#[cfg(test)]
mod tests {
    use super::uses_drive;

    fn procargs(argv: &[&[u8]], env: &[u8]) -> Vec<u8> {
        let mut data = (argv.len() as i32).to_ne_bytes().to_vec();
        data.extend(b"/path/to/qemu-system-aarch64\0\0\0");
        for arg in argv {
            data.extend(*arg);
            data.push(0);
        }
        data.extend(env);
        data
    }

    #[test]
    fn matches_exact_drive_even_with_spaces_and_empty_arguments() {
        let drive = b"file=/path with spaces/ubuntu.qcow2,format=qcow2,if=virtio";
        let data = procargs(
            &[b"qemu", b"", b"-drive", drive, b"-daemonize"],
            b"HOME=/tmp\0",
        );
        assert!(uses_drive(&data, drive));
        assert!(!uses_drive(&data, b"file=/path with spaces/ubuntu.qcow2"));
    }

    #[test]
    fn rejects_matching_bytes_outside_a_drive_option() {
        let drive = b"file=/vm/ubuntu.qcow2,format=qcow2,if=virtio";
        assert!(!uses_drive(
            &procargs(&[b"qemu", b"-other", drive], b""),
            drive
        ));
        let mut env = b"-drive\0".to_vec();
        env.extend(drive);
        env.push(0);
        assert!(!uses_drive(
            &procargs(&[b"qemu", b"-daemonize", b"-nographic"], &env),
            drive
        ));
        assert!(!uses_drive(&[1, 2, 3], drive));
    }
}
