# OpenMausBot Linux desktop source

`container-computer.ts` is copied from `server/container-computer.ts` at
`milind-soni/OpenMausBot` commit `f1d3a3a38e8a5e97ef9ea7bf33c61147d1f696b5`.
The three host configuration imports are replaced with `kronterm-adapter.ts`. A status cast preserves the upstream error message under KronTerm’s TypeScript settings.
The original Apache-2.0 license is retained alongside this file.

This source provisions the pinned multiarch `trycua/xfce-cua` image and installs
the exact CUA Driver 0.20.0 wheel with SHA-256 checks. Desktop automation runs
the real CUA driver inside the managed Linux container. This is a Docker or
Podman backed Linux desktop, not a dedicated QEMU guest machine.

KronTerm does not use the upstream process-launch MCP wrapper; its own agent
tool bridge invokes the narrow runtime with generation and assignment checks.
