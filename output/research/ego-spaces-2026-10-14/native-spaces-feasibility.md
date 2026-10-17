# Native background desktop feasibility

Evidence gathered 2026-10-15. Host: macOS 26.1 (25B78), arm64, SIP enabled. No display creation or system preference changes were performed during this investigation.

The usable implementation route is a retained headless virtual display. Native applications remain in the current macOS login. Moving owned windows onto that display through Accessibility can preserve physical-screen focus and pointer position; it does not create another user session or security boundary. Rendering on an inactive Mission Control Space may stop, so another Space alone is insufficient for reliable live screenshots. [SpaceO architecture](https://github.com/ParthJadhav/SpaceO)

## Implemented capability

`native/background-display.m` owns one fixed 1280x800 CGVirtualDisplay until stdin EOF or a termination signal. It performs runtime class/selector checks, uses a distinct serial callback queue and random nonzero display serial, and validates a non-main, nonmirrored, active display with exact UUID-derived native Space membership and nonoverlapping bounds. It retries only read-only publication checks for at most ten seconds; it never recreates the display or posts input.

The helper compiled and its read-only `--probe` returned `{"success":true,"available":1,"missing":[]}`. This establishes class and selector availability, not successful display creation. The persistent owner must be integrated before live placement testing.

The private descriptor/mode/settings contracts were corroborated with [SpaceO's private shim](https://github.com/ParthJadhav/SpaceO/blob/main/Sources/SpaceOPrivate/SpaceOPrivate.m). Its substantial implementation is not copied. If future integration copies substantial SpaceO code, its [MIT copyright and license](https://github.com/ParthJadhav/SpaceO/blob/main/LICENSE) must accompany it.

## System desktop alternatives

The host exports SLSCopyManagedDisplaySpaces, SLSManagedDisplayGetCurrentSpace, SLSMoveWindowsToManagedSpace, SLSSpaceSetCompatID, SLSSetWindowListWorkspace, SLSProcessAssignToSpace, SLSSpaceCreate and SLSManagedDisplaySetCurrentSpace. SLSPerformAsynchronousBridgedWindowManagementOperation does not resolve, although its move-operation Objective-C class is present. Symbol presence does not prove permissions or behavior.

Current [yabai implementation](https://github.com/asmvik/yabai/blob/master/src/space_manager.c) selects a bridged move when available, otherwise managed-space movement or a compatibility-ID workaround. Directly using these signatures without tested behavioral verification is insufficient. None were invoked here.

[Hammerspoon's Space creation](https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/spaces/spaces.lua) opens Mission Control and presses the Dock's `mc.spaces.add` Accessibility control; the operation visibly interrupts the desktop. Creation can be implemented through that path, but cannot honestly be called silent background creation.

## Remaining qualification boundaries

A virtual display changes the macOS display graph. [SpaceO's display safety document](https://github.com/ParthJadhav/SpaceO/blob/main/docs/DISPLAY_SAFETY.md) records private calls that cannot be cancelled, persistent creation budgets, one retained idle display, host health admission and circuit latches. Its unresolved WindowServer/ColorSync failures mean runtime class presence cannot justify a claim of universal reliability. KronTerm should retain one owner, bound mutation attempts, avoid automatic creation retries, verify cleanup, and stop admission after unknown lifecycle results.

The system Mission Control thumbnail border is Dock-owned. No supported API for recoloring it was established. KronTerm can color its own overview cards and owned background-desktop content; those are separate claims. The existing Electron swipe event bridge only receives gestures macOS delivers to the application; it cannot override the system's configured Mission Control gesture.
