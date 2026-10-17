import { describe, expect, it } from "vitest";
import { linuxVmQemuArgs, makeLinuxVmCloudInit } from "./qemu-provision";

describe("QEMU Linux provisioning", () => {
    it("uses SSH keys and disables passwords", () => {
        const seed = makeLinuxVmCloudInit("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test");
        expect(seed).toContain("ssh_pwauth: false");
        expect(seed).toContain("lock_passwd: true");
        expect(seed).toContain("sha256sum -c -");
        expect(seed).toContain("1024x640x24");
        expect(seed).not.toContain("wave123");
    });
    it("rejects cloud-init injection via public keys", () => {
        expect(() => makeLinuxVmCloudInit("ssh-ed25519 AAAA\nruncmd: [evil]")).toThrow("Invalid");
    });
    it("allocates a real guest kernel with loopback SSH and bounded resources", () => {
        const args = linuxVmQemuArgs("/tmp/kronterm", 59622);
        expect(args).toContain("virt,accel=hvf");
        expect(args).toContain("2048");
        expect(args).toContain("user,id=net0,hostfwd=tcp:127.0.0.1:59622-:22");
        expect(args).toContain("/opt/homebrew/share/qemu/edk2-aarch64-code.fd");
        expect(args.join(" ")).not.toContain("tcp::");
    });
});
