// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { LinuxGuestCloudFiles, LinuxGuestPackages } from "./guest-shell";

const WheelUrl =
    "https://files.pythonhosted.org/packages/94/9d/1c1838b69067e83266c3d2aae02d74eef353a43dc8644884ccf03fe7f933/cua_driver-0.20.0-py3-none-manylinux_2_31_aarch64.whl";
const WheelSha = "48833bc5e4c60e701fc9eefb57dbac36ec77ef3990f816fbbe85b4e954af2c77";

export function makeLinuxVmCloudInit(publicKey: string, wallpaperBase64?: string): string {
    if (!/^ssh-ed25519 [A-Za-z0-9+/=]+(?: .*)?$/.test(publicKey.trim())) throw new Error("Invalid VM public key.");
    if (wallpaperBase64 != null && !/^[A-Za-z0-9+/=]+$/.test(wallpaperBase64))
        throw new Error("Invalid wallpaper payload.");
    const wallpaper =
        wallpaperBase64 == null
            ? ""
            : `  - path: /usr/local/share/backgrounds/kronterm/liquid-chrome.png\n    permissions: '0644'\n    encoding: b64\n    content: ${wallpaperBase64}\n`;
    return `#cloud-config
users:
  - name: cua
    groups: [sudo, audio, video]
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${publicKey.trim()}
ssh_pwauth: false
ssh_deletekeys: false
disable_root: true
package_update: true
packages: [${LinuxGuestPackages.join(", ")}]
write_files:
${LinuxGuestCloudFiles}${wallpaper}  - path: /etc/systemd/system/kronterm-cua.service
    content: |
      [Unit]
      After=network.target
      [Service]
      User=cua
      Environment=HOME=/home/cua
      RuntimeDirectory=kronterm-cua
      RuntimeDirectoryMode=0700
      ExecStart=/usr/local/bin/kronterm-cua-session
      Restart=always
      [Install]
      WantedBy=multi-user.target
runcmd:
  - install -d -o cua -g cua -m 0700 /run/kronterm-cua /home/cua/workspace
  - python3 -m venv /opt/cua
  - curl -fsSL '${WheelUrl}' -o /tmp/cua_driver-0.20.0-py3-none-manylinux_2_31_aarch64.whl
  - echo '${WheelSha}  /tmp/cua_driver-0.20.0-py3-none-manylinux_2_31_aarch64.whl' | sha256sum -c -
  - /opt/cua/bin/pip install --no-deps /tmp/cua_driver-0.20.0-py3-none-manylinux_2_31_aarch64.whl
  - driver=$(find /opt/cua/lib -path '*/cua_driver/bin/cua-driver' -type f -print -quit); install -m 0755 "$driver" /usr/local/bin/cua-driver
  - sudo -u cua env HOME=/home/cua xdg-settings set default-web-browser kronterm-stock-browser.desktop
  - install -d -m 0700 /var/lib/kronterm/retired-desktop
  - for file in /usr/share/applications/kronterm-browser.desktop /usr/local/bin/kronterm-browser /usr/local/bin/kronterm-dock /usr/local/share/kronterm/openbox.xml; do if test -f "$file"; then mv "$file" /var/lib/kronterm/retired-desktop/; fi; done
  - apt-get remove --no-auto-remove -y python3-pyqt6.qtwebengine openbox feh pcmanfm python3-tk
  - systemctl daemon-reload
  - systemctl enable kronterm-cua
  - systemctl restart kronterm-cua
`;
}

export function makeLinuxVmMetadata(): string {
    return `instance-id: kronterm-${randomUUID()}\nlocal-hostname: kronterm-linux\n`;
}

export function linuxVmQemuArgs(directory: string, sshPort: number): string[] {
    if (!Number.isInteger(sshPort) || sshPort < 1024 || sshPort > 65535) throw new Error("Invalid SSH port.");
    return [
        "-machine",
        "virt,accel=hvf",
        "-cpu",
        "host",
        "-smp",
        "2",
        "-m",
        "2048",
        "-bios",
        "/opt/homebrew/share/qemu/edk2-aarch64-code.fd",
        "-drive",
        `file=${directory}/ubuntu.qcow2,format=qcow2,if=virtio`,
        "-drive",
        `file=${directory}/seed.iso,format=raw,if=virtio,readonly=on`,
        "-netdev",
        `user,id=net0,hostfwd=tcp:127.0.0.1:${sshPort}-:22`,
        "-device",
        "virtio-net-pci,netdev=net0",
        "-display",
        "none",
        "-serial",
        `file:${directory}/console.log`,
        "-pidfile",
        `${directory}/qemu.pid`,
        "-daemonize",
    ];
}

// Share the same Xvfb session the agent controls; a QEMU framebuffer would show a different display.
export const LinuxVmVncSetup = `set -eu
if ! command -v x11vnc >/dev/null; then
  sudo env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=180 update >/dev/null
  sudo env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=180 install -y x11vnc >/dev/null
fi
previous_unit=$(sudo cat /etc/systemd/system/kronterm-vnc.service 2>/dev/null || true)
sudo tee /etc/systemd/system/kronterm-vnc.service >/dev/null <<'UNIT'
[Unit]
After=kronterm-cua.service
Requires=kronterm-cua.service
[Service]
User=cua
ExecStart=/usr/bin/x11vnc -display :1 -localhost -rfbport 5900 -nopw -forever -shared -xkb -wait 8 -defer 8 -setdefer -1 -nowireframe
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now kronterm-vnc.service
current_unit=$(sudo cat /etc/systemd/system/kronterm-vnc.service)
if [ "$previous_unit" != "$current_unit" ]; then
  sudo systemctl restart kronterm-vnc.service
fi
for attempt in $(seq 1 30); do
  if python3 -c 'import socket; s=socket.create_connection(("127.0.0.1",5900),1); assert s.recv(12).startswith(b"RFB "); s.close()' 2>/dev/null; then exit 0; fi
  sleep 1
done
exit 1
`;
