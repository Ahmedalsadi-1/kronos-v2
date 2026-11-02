"""Read macOS rusage_info_v2; field layout comes from the platform sys/resource.h."""
import ctypes
import json
import struct
import sys

lib = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
read_usage = lib.proc_pid_rusage
read_usage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
read_usage.restype = ctypes.c_int
result = []
for value in sys.argv[1:]:
    pid = int(value)
    buffer = ctypes.create_string_buffer(256)
    if read_usage(pid, 2, buffer) != 0:
        result.append({"pid": pid, "error": ctypes.get_errno()})
        continue
    resident, footprint = struct.unpack_from("QQ", buffer, 64)
    result.append({"pid": pid, "residentBytes": resident, "physicalFootprintBytes": footprint})
print(json.dumps(result))
