# OpenMausBot Linux desktop source

`container-computer.ts` is copied from `server/container-computer.ts` at
`milind-soni/OpenMausBot` commit `1123705e6e70741e3e8b92925266d0604257b9a7` (the locally imported integration).
The three host configuration imports are replaced with `kronterm-adapter.ts`. A status cast preserves the upstream error message under KronTerm’s TypeScript settings.
The original Apache-2.0 license is retained alongside this file.

This source provisions the pinned multiarch `trycua/xfce-cua` image and installs
the exact CUA Driver 0.37.0 wheel with SHA-256 checks. Desktop automation runs
the real CUA driver inside the managed Linux container. This is a Docker or
Podman backed Linux desktop, not a dedicated QEMU guest machine.

KronTerm does not use the upstream process-launch MCP wrapper; its own agent
tool bridge invokes the narrow runtime with generation and assignment checks.
