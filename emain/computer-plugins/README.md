# Computer provider plugins

KronTerm owns the computer registry and access policy. Provider modules own provisioning,
health, terminal execution, desktop input and teardown. `registry.ts` persists named
instances and provider enablement in `~/.kronterm/linux-desktops/computer-plugins.json`.

- **Ubuntu VM** uses QEMU on Apple Silicon, with a distinct disk, cloud-init seed,
  SSH key, forwarded SSH port and VNC bridge per instance. The existing Ubuntu
  computer keeps its original disk and port.
- **OpenMausBot local computers** adapts the imported OpenMausBot Cua 0.37 runtime,
  retaining pinned image checks, Docker/Podman/Apple Container detection, resource
  limits, private durable workspaces and loopback viewers. Each computer derives
  independent container/workspace identities from its immutable ID. See
  `../linux-desktop/upstream/openmaus/SOURCE.md` and the retained license/notice.

Settings → Computers manages plugins, container-service startup, instance creation,
image preparation and VM lifecycle. Settings → Plugins links to this manager.
Preparation downloads/builds an image; Start never silently prepares one.

The composer Computer menu sits beside the agent selector. Choosing a computer
reserves it for that workspace and opens its widget; an already prepared computer
starts automatically. Computer mode is an in-memory workspace grant, cleared on app
restart. Disabling it returns control to the user. Another workspace's reservation
must be released before reassignment. Stop does not remove persistent files.

Computer mode supports the local KronTerm Agent. Its managed toolset is pinned to
`kronterm`, whose calls cross the authenticated main-process boundary. The tool
server applies the current workspace selection on each request and denies host
shell, filesystem, device and native desktop tools, including custom allowlist
attempts. External ACP engines are refused while this mode is enabled because they
can retain independent host tools. Running external agents block activation.

`sandbox_vm_status`, `sandbox_vm_exec`, `sandbox_vm_files`, `sandbox_vm_browser`
and `sandbox_vm_desktop` resolve the selected computer in main; callers cannot
supply another computer ID. Control generations fence stale operations. Browser
commands run Python/CDP inside the guest and start its own Chromium, never a host
browser. File input is encoded as data and larger writes use bounded chunks.
Widget interaction is limited to supported views in the same workspace; host
terminal/file/native-app/settings widgets and local-file web pages are denied.

Each managed viewer owns a connection, so separate computers can remain open.
Fullscreen keeps the same connection. External VNC/noVNC endpoint setup remains
available through Computer settings and does not grant VM shell access.

Hermes tool calls carry the dispatcher's runtime session identity separately from
model arguments. The trusted composer registers live/stored chat IDs to their
owning workspace. The native bridge uses that mapping rather than focused-tab
state; unknown identities fail closed while any Computer grant exists. The
Hermes MCP path cannot bypass the session-scoped native adapter. An active grant
must be disabled before moving its chat to another workspace.
