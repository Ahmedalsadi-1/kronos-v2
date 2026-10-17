# Linux desktops and CUA agents

## Implementation

KronTerm now has a Linux Desktops view in its app registry and an interactive development dashboard at http://127.0.0.1:7007/?preview=linux-vms.

Two distinct targets share lifecycle, capture, input and control ownership APIs:

- Linux Desktop: the actual OpenMausBot container runtime, provisioning a digest-pinned trycua XFCE image and SHA-256-verified CUA Driver 0.20.0. Docker/Podman desktop isolation; not a separate guest kernel.
- Ubuntu Virtual Machine: a separate ARM64 Ubuntu guest using QEMU and Apple HVF, two virtual CPUs, 2 GB RAM and a sparse 20 GB disk. Its desktop and CUA driver run inside the guest. Current support is Apple Silicon macOS with QEMU/Homebrew firmware installed.

The VM uses a dated Canonical cloud image with a pinned checksum, key-only SSH on loopback, persistent guest storage, and a NoCloud seed. Its desktop is XFCE running under Xvfb. This is a real Linux guest desktop rather than an imitation of Linux drawn in React.

The management view supports preparation, creation, start/stop, live screen capture, mouse and keyboard input, and takeover/resume. It distinguishes the Docker desktop from the Ubuntu VM. Frames are screenshot polling, not a video stream. Live preview uses the existing opt-in local development transport with a per-process token and same-origin checks; production uses trusted Electron workspace IPC.

## Agent access

Nine MCP tools expose Linux desktop list/start/stop/screenshot/click/type/key/scroll/exec. Actions are restricted to the exact user-assigned desktop, reservation label and observed control generation. Provisioning and assignment stay in the management UI. Taking control invalidates queued stale actions. Commands execute in the container or Ubuntu guest, not on the host.

Agent access is a reservation, not an automatic task launch. The UI does not invent a running bot fleet. Reservation labels under the shared native transport are not separately authenticated bot identities. Existing in-flight commands cannot be undone by takeover; subsequent stale actions are rejected.

Use Agent access to reserve a desktop, then direct an existing Kronos agent to use linux_desktop_list and linux_desktop_screenshot before Linux-specific controls. The packaged desktop must load this implementation for its native MCP bridge to expose the added tools.

## Source reuse

Actual OpenMausBot server/container-computer.ts is vendored from commit f1d3a3a38e8a5e97ef9ea7bf33c61147d1f696b5, with narrow host adapters and one TypeScript status cast. Its Apache-2.0 license is retained. CUA Driver's MIT license is retained, and license resources are included in packaging. Cua Spaces source is not imported.

Source records: emain/linux-desktop/SOURCE.md and emain/linux-desktop/upstream/{openmaus,cua}/SOURCE.md.

Primary repositories:

- https://github.com/milind-soni/OpenMausBot
- https://github.com/trycua/cua

The previously imported OpenMuse process-output utility remains separately attributed; its full application is not used as this Linux runtime.

## Verification

- Real Docker desktop boot, capture and guest command execution verified.
- Real CUA click, type, key and scroll calls verified on the Docker desktop; typed input was visible in its terminal.
- MCP screenshot image and stale-agent rejection after takeover verified against the actual Docker runtime.
- Docker stop and subsequent start verified; the desktop becomes ready after startup.
- Ubuntu independent kernel, key-based SSH, XFCE and CUA daemon health verified earlier. Later SSH connections repeatedly timed out, including after a second boot reached normal login. Live QEMU GUI frame/input verification remains incomplete. The managed Ubuntu VM was stopped with its disk preserved; the Docker desktop remains running.
- Sixteen targeted desktop tests and 76 MCP tests passed. Full TypeScript validation did not complete during repeated attempts under heavy host load; it is not reported as passing. The stalled validation process was stopped to avoid continuing resource pressure.
- Light/dark dashboard renders and 390px mobile width verified previously; saved screenshots are under screenshots/linux-vms-*.

This implementation is Labs functionality. It does not yet provide arbitrary multi-VM creation, VM snapshots, or an autonomous task scheduler in the management panel. A packaged release has not been built or validated in this task.
