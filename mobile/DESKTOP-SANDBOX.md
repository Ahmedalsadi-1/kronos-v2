# Mobile desktop and code sandbox work

## Implemented boundary

`src/lib/agent-linux-sandbox.ts` provides disposable Linux shell-script execution using a fresh v86 emulator.
It does not restore or save the user's VM checkpoint. The guest has 64 MB RAM and no network adapter.
Only explicitly supplied workspace files enter the guest. Results contain an exit code, bounded command output,
and explicitly requested text artifacts. A separate function copies successful artifacts into a selected persistent VM.
It is not yet registered as a model tool or exposed in the interface.

Runs are serialized, expire after 120 seconds including boot, and accept an AbortSignal. Input is limited to 1 MB,
100 files, a 16000-character script and 20 output paths. Paths reject traversal, absolute names and reserved control
files. The output capture is capped at 64 KiB. Artifact size is checked after retrieval; guest memory remains bounded,
but a future guest service should enforce byte limits before retrieval. This is emulator guest separation inside the
app's browser worker, not hardware isolation or a separate iOS process.

## Implemented interface prototype

The Linux workspace now exposes browser-style Terminal, Desktop, Preview, Files and Code tabs. Code runs scripts
through the disposable runner and shows actual outputs, exit codes and selected artifacts. Its copy action transfers
successful artifacts to the persistent console VM and checkpoints it. Preview loads a selected HTML file from the
console guest into an origin-isolated frame with scripts disabled and a restrictive resource policy.

The Desktop tab starts a separate 128 MB Tiny Core 11 guest with a real framebuffer, touch trackpad, click controls
and text/Enter/Tab/Esc keyboard controls. It is explicitly temporary, pauses when hidden/backgrounded, and is
destroyed on app reload or termination. Panels now stay mounted during chat/widget switching, preserving guest state
in memory. Its desktop boot was observed in the browser at a phone-sized viewport. It is not the console guest.

## Work remaining

- Messenger opening view with small corner icons and minimal labels, based on the approved Grok Bot reference.
- A single persistent guest shared by the desktop, terminal, file transfer and agent tools.
- Agent execution settings defaulting to a disposable sandbox; direct execution in the persistent user VM is opt-in.
- Review and selected-file transfer from completed sandbox runs into the user VM.
- Touch controls on iPhone and Android, including keyboard, pointer mode and platform safe areas.

The saved guest remains a console image. The separate Tiny Core guest has a verified graphical boot, but has no
checkpoint or workspace-file integration. A reproducible current guest with a minimal window manager, display server
and framebuffer/serial input integration is required. UTM SE native integration remains uncompiled. Performance and
input must be tested on physical devices before claiming a working native mobile desktop.

## smolvm

The upstream README lists macOS, Linux and Windows hosts and requires their hardware virtualization APIs.
It lists no iOS or Android host support. Do not add its Node SDK to the Capacitor web bundle and claim local iPhone
execution. It is a candidate for an explicitly connected supported computer. No remote adapter is implemented here.

Source: https://github.com/smol-machines/smolvm#platform-support
