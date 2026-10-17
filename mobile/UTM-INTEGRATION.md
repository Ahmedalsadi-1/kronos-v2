# Optional on-device Linux: UTM SE

Status: integration design, not bundled or compiled. The currently implemented local Linux runtime uses v86.

## Native engine

Use the UTM SE QEMU backend for stock iOS. Do not depend on JIT, Hypervisor.framework, an external UTM installation,
or a computer connection. UTM is an application source tree, not a ready-made Capacitor plugin; its backend and
dependencies must be adapted into the KronTerm native target.

Relevant upstream boundaries are `UTMQemuVirtualMachine`, `UTMQemuSystem`, `UTMQemuManager`, and `UTMSpiceIO`.
QEMU runs in the application process on iOS. Treat the guest as guest isolation inside the application's iOS sandbox,
not as a separate iOS security process. Keep guest disks and shared files in the app container, and disable network,
clipboard, and shared folders until explicitly enabled. Expose only a dedicated workspace directory when sharing files.

## Intended product behavior

- Local files and supported native tools remain usable without starting a VM.
- Starting a Linux VM is an explicit optional action. Show the engine and guest resource budget in its settings.
- Persist configuration and guest disks locally. Pause on suspension and restore only supported durable state.
- Route terminal, browser preview, and agent tools to the selected local guest through a bounded guest protocol.
- Connect to a computer only after an explicit connection action.
- Report actual engine availability; never substitute v86 while displaying UTM as the engine.

## Integration work remaining

1. Pin an upstream release and its recursive submodules, then obtain or build its `ios-tci-arm64` sysroot.
2. Build a native backend target with the upstream QEMU shared libraries and required CocoaSpice dependencies.
3. Add a Capacitor bridge for create/start/pause/resume/status and serial/display events. Serialize lifecycle operations;
   account for upstream limitations around multiple QEMU instances and relaunch in one application process.
4. Package a reproducible minimal Linux guest, licenses, source provenance, and a guest tool service.
5. Integrate the native backend with workspace surfaces, Live Activity status, and local task execution.
6. Compile and test on the physical iPhone: cold boot, pause/background, disk persistence, memory pressure,
   guest network isolation, file boundaries, and recovery after termination.

Full Xcode and the iOS SDK are missing from the current Mac. USB detection alone does not allow compilation or
installation of this source. The existing widgets and native shell also require native compilation before device claims.

## Upstream references

- [Architecture](https://github.com/utmapp/UTM/blob/main/Documentation/Architecture.md)
- [iOS build instructions](https://github.com/utmapp/UTM/blob/main/Documentation/iOSDevelopment.md)
- [UTM license](https://github.com/utmapp/UTM/blob/main/LICENSE)

UTM's Apache license does not replace the licenses of QEMU, SPICE, Linux, or guest packages. Preserve each dependency's
notices and satisfy its distribution obligations before publishing a bundled build.
