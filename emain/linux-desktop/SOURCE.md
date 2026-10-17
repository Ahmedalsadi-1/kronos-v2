# Linux desktop backends

KronTerm exposes one Linux machine: the QEMU Ubuntu VM. The previous
Docker/Podman desktop provider has been removed from the runtime and picker.
Upstream OpenMaus source and its license remain for shared command types
and data-directory utilities.

The QEMU backend adapts KronTerm's existing `scripts/setup-sandbox.sh` flow:
Ubuntu ARM64 cloud image, qcow2 disk, cloud-init seed, XFCE desktop and SSH.
It corrects the original firmware omission and data-directory mismatch. It
replaces fixed passwords with a locally generated Ed25519 SSH key, disables
password authentication and forwards SSH only on loopback. ISO creation
uses ISO9660/Joliet without HFS, so Ubuntu detects the NoCloud seed.

QEMU provisions a separate ARM64 Ubuntu guest kernel using Apple's HVF
acceleration, 2 virtual CPUs, 2 GB RAM and a sparse 20 GB overlay disk.
Its CUA Driver wheel is the same SHA-256-verified 0.20.0 artifact used by
OpenMausBot. Input and screenshot operations execute the real CUA driver
inside that guest over authenticated SSH. No VM-agent responses are mocked.

The Ubuntu image is `noble-server-cloudimg-arm64.img` from Canonical's
cloud-image server, build `20260926`, pinned by SHA-256:
`1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55`.
The download uses the dated `noble/20260926` URL and verifies that checksum.

Guest input uses CUA Driver's `scope=desktop` global input route, without
an explicit `target` object (the pinned Linux driver rejects that object).
SSH multiplexing and a two-second readiness cache reduce input overhead.
Guest driver error objects are surfaced as failures.

The VM shuts down after five minutes without input or guest commands.
Screenshot polling does not keep it alive. Initial startup allows twenty
minutes for cloud-init provisioning. Task finish stops the reserved VM
immediately unless the user has taken control.
