import { describe, expect, it } from "vitest";
import { linuxVmQemuArgs, makeLinuxVmCloudInit } from "./qemu-provision";

describe("QEMU Linux provisioning", () => {
    it("uses SSH keys and disables passwords", () => {
        const seed = makeLinuxVmCloudInit("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test");
        expect(seed).toContain("ssh_pwauth: false");
        expect(seed).toContain("ssh_deletekeys: false");
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

it("preserves XFCE and stock Chromium and only adds focused normal-window behavior", () => {
    const seed = makeLinuxVmCloudInit("ssh-ed25519 AAAA test");
    const packages = seed.match(/^packages: \[(.*)\]$/m)[1].split(", ");
    expect(packages).toContain("xfce4");
    expect(packages).toContain("xfce4-terminal");
    expect(packages).not.toContain("openbox");
    expect(packages).not.toContain("python3-pyqt6.qtwebengine");
    expect(seed).toContain("startxfce4");
    expect(seed).toContain("xprop -spy -root _NET_ACTIVE_WINDOW");
    expect(seed).toContain("WM_TRANSIENT_FOR(WINDOW)");
    expect(seed).not.toContain("encoding: b64");
    expect(seed).not.toContain("QTWEBENGINE_REMOTE_DEBUGGING");
});

it("keeps the bundled guest payload synchronized with its editable sources", async () => {
    const { readFile } = await import("node:fs/promises");
    const { LinuxGuestSources } = await import("./guest-assets");
    for (const name of ["appearance.sh", "focus-one.sh", "open-app.sh", "session.sh"] as const) {
        expect(LinuxGuestSources[name]).toBe(await readFile(new URL(`./guest/${name}`, import.meta.url), "utf8"));
    }
});

it("uses concrete Ubuntu Noble package names that cloud-init can resolve", () => {
    const seed = makeLinuxVmCloudInit("ssh-ed25519 AAAA test");
    const packages = seed.match(/^packages: \[(.*)\]$/m)[1].split(", ");
    expect(packages).toContain("libglib2.0-0t64");
    expect(packages).toContain("libatspi2.0-0t64");
    expect(packages).not.toContain("libglib2.0-0");
    expect(packages).not.toContain("libatspi2.0-0");
});

it("maximizes normal focused apps without touching dialogs or malformed window IDs", async () => {
    const { mkdtemp, readFile, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const dir = await mkdtemp(join(tmpdir(), "kronterm-focus-"));
    const log = join(dir, "actions");
    await writeFile(
        join(dir, "xprop"),
        `#!/bin/sh
if [ "$1" = "-spy" ]; then
    printf '%s\\n' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x10, 0x0' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x10, 0x0' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x20' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x30' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0xZZ'
else
    case "$2" in
        0x10) printf '%s\\n' '_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_NORMAL' 'WM_TRANSIENT_FOR: not found.' ;;
        0x20) printf '%s\\n' '_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_NORMAL' 'WM_TRANSIENT_FOR(WINDOW): window id # 0x10, 0x0' '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x10, 0x0' ;;
        0x30) printf '%s\\n' '_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_DIALOG' ;;
        *) exit 1 ;;
    esac
fi
`,
        { mode: 0o755 }
    );
    await writeFile(join(dir, "wmctrl"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FOCUS_TEST_LOG"\n', { mode: 0o755 });
    await promisify(execFile)("sh", [new URL("./guest/focus-one.sh", import.meta.url).pathname], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FOCUS_TEST_LOG: log },
        timeout: 2000,
    });
    expect((await readFile(log, "utf8")).trim()).toBe("-ir 0x10 -b add,maximized_vert,maximized_horz");
});

it("includes the static wallpaper only in provisioning data and rejects payload injection", () => {
    const seed = makeLinuxVmCloudInit("ssh-ed25519 AAAA test", "aGVsbG8=");
    expect(seed).toContain("path: /usr/local/share/backgrounds/kronterm/liquid-chrome.png");
    expect(seed).toContain("encoding: b64\n    content: aGVsbG8=");
    expect(() => makeLinuxVmCloudInit("ssh-ed25519 AAAA test", "bad\nruncmd: evil")).toThrow("Invalid wallpaper");
});

it("focuses an existing app instead of launching another process from the dock", async () => {
    const { mkdtemp, readFile, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const dir = await mkdtemp(join(tmpdir(), "kronterm-app-reuse-"));
    const log = join(dir, "actions");
    await writeFile(
        join(dir, "wmctrl"),
        '#!/bin/sh\nprintf "focus %s\\n" "$*" >> "$APP_TEST_LOG"\nexit "$APP_EXISTS"\n',
        { mode: 0o755 }
    );
    await writeFile(join(dir, "xfce4-terminal"), '#!/bin/sh\nprintf "launch\\n" >> "$APP_TEST_LOG"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, APP_TEST_LOG: log, APP_EXISTS: "0" };
    const script = new URL("./guest/open-app.sh", import.meta.url).pathname;
    await promisify(execFile)("sh", [script, "terminal"], { env, timeout: 2000 });
    expect(await readFile(log, "utf8")).toBe("focus -xa xfce4-terminal\n");
    await writeFile(log, "");
    await promisify(execFile)("sh", [script, "terminal"], { env: { ...env, APP_EXISTS: "1" }, timeout: 2000 });
    expect(await readFile(log, "utf8")).toBe("focus -xa xfce4-terminal\nlaunch\n");
});
