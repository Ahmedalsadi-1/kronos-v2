# Orca iOS source attribution

Vendored from https://github.com/stablyai/orca at commit `12f53da542d03473367e48a63b85a49eae7c5f8b`, using `git show` of the committed files (not the modified working checkout). MIT license retained in LICENSE.

- emulator-touch-frame.ts: src/shared/emulator-touch-frame.ts
- emulator-gesture-sender.ts: src/main/emulator/emulator-gesture-sender.ts; relative import adapted and 15-second input deadline added.
- serve-sim-ax-normalization.ts: src/main/emulator/serve-sim-ax-normalization.ts
- serve-sim-endpoint-readiness.ts: src/main/emulator/serve-sim-endpoint-readiness.ts

The parent ios-simulator-control.ts adapts Orca's ios-emulator-backend.ts lifecycle and typed CLI operations to KronTerm. It uses serve-sim 0.1.40, the Apache-2.0 native helper package pinned by that Orca revision. It does not copy camera quarantine removal or global process killing. Session detach leaves the simulator booted; device shutdown is separately owned by KronTerm.

Requirements: macOS, full Xcode with an installed iOS runtime, and bundled serve-sim. Merely having Command Line Tools is insufficient. The embedded stream is a real CoreSimulator framebuffer; input uses serve-sim's native HID helper.

- mjpeg-frame-parser.ts and mjpeg-frame-stream.ts: exact src/main/emulator copies.
