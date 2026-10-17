# CUA Linux desktop runtime

KronTerm executes the real CUA Driver 0.20.0 installed by SHA-256 verified platform wheels from the OpenMausBot runtime. The Docker XFCE base image is pinned by digest in the vendored OpenMausBot module. The QEMU guest installs the same ARM64 driver wheel and supplies its own Ubuntu kernel.

CUA Driver is MIT licensed. Its native binary runs inside the desktop or guest; KronTerm does not vendor or rebrand Cua Spaces (FSL licensed).

Primary upstream: https://github.com/trycua/cua
OpenMausBot source provenance: ../openmaus/SOURCE.md
