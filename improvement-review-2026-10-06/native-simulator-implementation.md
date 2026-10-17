# Native simulator implementation

The Computers app now shows a device picker, a central live screen, power and ownership controls, and a compact Home/Back/Rotate/keyboard strip. Device setup is collapsed. Light/dark theme retained.

## Actual source reused

- Orca revision `12f53da542d03473367e48a63b85a49eae7c5f8b`: copied iOS MJPEG frame parser/stream, touch encoder/gesture sender, readiness and accessibility normalization; copied Android SDK discovery, AVD/device parsers, input mappings and error types. Source copies and MIT license are under `emain/device-simulator/orca-ios/` and `emain/device-simulator/android/vendor/orca/`.
- OpenMausBot revision `f1d3a3a38e8a5e97ef9ea7bf33c61147d1f696b5`: copied LocalVmLease/LocalVmLeasePool, used to fence live device viewers during connect/detach. Apache license and source attribution retained under `emain/device-simulator/upstream/openmaus/`.
- OpenMuse revision `1ac68f3909f2478ab6280883f1ab5ea65eb5719d`: copied bounded process output collector, used for the real iOS helper executor with timeout and process cleanup. MIT license and source attribution retained under `emain/device-simulator/upstream/openmuse/`.
- Pinned `serve-sim` 0.1.40 is installed and included in desktop packaging, with its Apache license. It supplies the real universal macOS native simulator helper. Guest operating systems and runtimes are installed separately through Xcode or Android SDK.

Repository links: [Orca](https://github.com/stablyai/orca), [OpenMausBot](https://github.com/milind-soni/OpenMausBot), [OpenMuse](https://github.com/CopilotKit/openmuse).

## Control paths

iOS: simctl lifecycle plus serve-sim live MJPEG, touch, swipes, ASCII typing, Home and rotation. Accessibility backend also available internally. Full Xcode and an installed Simulator runtime required.

Android: actual AVD boot with a persistent emulator process; ADB tap/swipe/text/Home/Back and PNG frame refresh. Frames use serial polling at up to five reads per second, bounded by capture time. This is working screen refresh, not Orca's H.264 scrcpy transport. Appium sessions remain an optional separately configured route for physical iPhones and other mobile sessions.

Live frames cross narrow Electron IPC methods. A connection belongs to its workspace window, malformed frames and stale generations are rejected, and helper teardown is fenced before reconnect. User takeover blocks agent mutations until explicit resume. MCP tools now accept real Android target IDs and expose Home, swipe and rotation.

## Verified

- Booted the existing `pixel_8_api34` AVD and captured its real Android home screen.
- Live browser preview exercised Open screen, Home, normalized swipe, takeover and resume against that VM. Home command completed in 158 ms in one measured run, excluding browser scheduling.
- Light/dark live screenshots at 1920x1080, 1440x900 and 1280x800, plus 390px layout; no horizontal overflow in the measured page.
- 45 targeted desktop tests and all 71 MCP tests pass. Desktop TypeScript check passes.
- No Xcode installation on this host: live iOS control could not be verified. This remains Labs.

## Current preview

The local preview at `http://127.0.0.1:7007/?preview=computers` is running with real devices enabled. Refresh it and choose Open screen for the running Android VM. Development routes require a local connection, matching origin and a per-process token; they exist only with `KRONTERM_DEVICE_PREVIEW=1`. The normal packaged app uses Electron IPC.

OpenMausBot and OpenMuse's complete servers, cloud credentials, desktop container images, enterprise code and app stacks are not incorporated. The reused modules above are the precise source integration in this change.
