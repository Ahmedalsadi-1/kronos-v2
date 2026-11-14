# KronOS Linux

KronOS Linux runs a real Ubuntu 24.04 LTS guest with its own Linux kernel, XFCE desktop, and persistent disk.
It opens in the existing Computers viewer alongside the host workspace. This is separate from Spatial Mode,
which arranges the host's live widgets.

## Launch on an Apple Silicon Mac

1. Install QEMU with Homebrew: `brew install qemu`.
2. Open the KronOS command palette and search for **KronOS Linux**, or select it in the device picker.
3. Select **Set up and launch**. The first boot downloads a 620 MB Ubuntu image and installs the desktop and browser,
   so it needs an internet connection. The viewer opens when the desktop is ready.
4. On later visits, use **Start VM** to boot the same disk. Use **Stop VM** when you are finished.

Files and installed packages are stored on the guest disk. Stop VM asks Linux to shut down before the VM exits.
Restarting boots a fresh session on the same disk. An idle VM can stop after five minutes. Agent control is granted
separately in KronOS.
The VM has outbound networking and uses local SSH and viewer connections. KronOS does not mount the host home directory.

## Why Ubuntu 24.04 LTS

The existing runtime already has a checksum-pinned ARM64 cloud image and tested provisioning for XFCE and Chromium.
Reusing it preserves existing guest disks. Canonical lists standard security maintenance through May 2029
in its [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).

The current VM backend uses hardware acceleration on Apple Silicon. Windows and Linux hosts need their own tested
hypervisor and packaging paths. A bootable installer for physical computers would be a separate distribution target.
