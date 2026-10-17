// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";

const WheelUrl =
    "https://files.pythonhosted.org/packages/94/9d/1c1838b69067e83266c3d2aae02d74eef353a43dc8644884ccf03fe7f933/cua_driver-0.20.0-py3-none-manylinux_2_31_aarch64.whl";
const WheelSha = "48833bc5e4c60e701fc9eefb57dbac36ec77ef3990f816fbbe85b4e954af2c77";

export function makeLinuxVmCloudInit(publicKey: string): string {
    if (!/^ssh-ed25519 [A-Za-z0-9+/=]+(?: .*)?$/.test(publicKey.trim())) throw new Error("Invalid VM public key.");
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
disable_root: true
package_update: true
packages: [xfce4, xfce4-terminal, chromium-browser, xvfb, dbus-x11, libgtk-3-bin, curl, python3-venv, openssh-server, libx11-6, libxtst6, libxrandr2, libxfixes3, libxi6, libglib2.0-0, libatspi2.0-0]
write_files:
  - path: /usr/local/bin/kronterm-cua-session
    permissions: '0755'
    content: |
      #!/bin/sh
      set -eu
      export DISPLAY=:1 HOME=/home/cua XDG_RUNTIME_DIR=/run/kronterm-cua
      export CUA_DRIVER_RS_TELEMETRY_ENABLED=0 CUA_DRIVER_INSTALL_CHANNEL=python_package
      Xvfb :1 -screen 0 1024x640x24 -ac -nolisten tcp &
      sleep 2
      dbus-run-session -- sh -c 'startxfce4 >/home/cua/xfce.log 2>&1 & exec /usr/local/bin/cua-driver serve --socket /run/kronterm-cua/kronterm-cua.sock --permission-mode standard'
  - path: /etc/systemd/system/kronterm-cua.service
    content: |
      [Unit]
      After=network.target
      [Service]
      User=cua
      Environment=HOME=/home/cua
      RuntimeDirectory=kronterm-cua
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
  - systemctl enable --now kronterm-cua
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
