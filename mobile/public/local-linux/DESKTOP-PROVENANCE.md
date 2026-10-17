# Tiny Core desktop prototype image

- File: `tinycore-11.iso`
- Source download: https://i.copy.sh/TinyCore-11.0.iso
- Upstream v86 demo configuration: https://github.com/copy/v86/blob/master/src/browser/main.js (`tinycore` entry)
- Distribution: Tiny Core Linux 11.0, https://www.tinycorelinux.net/
- Bytes: 19922944
- SHA-256: `778fc3788d9df3de72970827968b2b195aca827401db6f6f9cbdb737d4300bda`

This is a local Labs desktop prototype. The ISO includes separately licensed Linux and userspace components.
Before public distribution, replace it with a reproducible guest build and package complete component notices and
corresponding source as required. A current supported guest should replace this historical demo image before release.

No network adapter, host filesystem mount, credential forwarding or clipboard bridge is configured for this guest.
Its RAM and disk changes are not persisted. It is separate from the checkpointed console guest.
