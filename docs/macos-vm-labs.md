# macOS VM widgets (Labs)

KronTerm can start a local Tart macOS guest without a host display window and
show its VNC display inside the Machines widget. Apps run inside the guest;
host app installations, sign-ins, and windows are separate.

AppStream widgets now open this isolated path by default. They do not launch a
host app unless the user explicitly selects **Stream app on this Mac**. Without
Tart and a local guest, the widget shows setup requirements. Once the guest is
running, open the requested app inside it using Spotlight or the Dock. This is
a complete guest desktop, not single-app embedding.

## Setup

Requires an Apple-silicon Mac, a compatible macOS host, Tart, and sufficient
memory and disk space for a macOS guest. Follow the current
[Tart installation and guest creation guide](https://github.com/openai/tart/blob/main/docs/quick-start.md).

For a fresh Apple restore image, the documented commands are:

```sh
brew install openai/tools/tart
tart create --from-ipsw=latest kronterm-macos
tart run kronterm-macos
```

Complete guest setup in Tart, install the desired apps, and shut down the guest.
The restore image and guest disk require a substantial download and storage.
KronTerm does not download an OS image automatically.

Open Machines, select **macOS VM**, choose the local guest, and press **Start VM**.
The macOS display runs inside the widget. **Actual size** shows native pixels;
**Fit display** scales the desktop to the widget. Shut down macOS inside the guest
before using **Stop VM**. Closing the widget or KronTerm stops its managed process.
KronTerm does not adopt or terminate VMs started outside its runtime.

## Agent control

Mention the macOS VM widget with `@widget:`. The agent should inspect its screenshot,
then use the widget input tools to operate the guest. Launch guest apps through
Spotlight or the guest Dock. Use short observed action sequences and verify the
resulting display. `@app:` mentions open an AppStream widget and do not switch
agent control to the host automatically. The host application list is not a
guest-app inventory. Native computer tools still target the host and must not
be used as a substitute for missing guest setup.

Guest accessibility integration, guest-app discovery in `@app:`, automatic OS
provisioning, guest lifecycle MCP tools, and single-app guest cropping remain
follow-up work. This path currently presents the complete guest desktop.

## Isolation and implementation

The managed command uses `--no-graphics --vnc-experimental --no-clipboard --no-audio`.
It shares no host folders. Guest network access uses Tart's default networking.
Tart's experimental VNC provider uses private Virtualization framework interfaces;
this is a Labs dependency, not a stable Apple API contract.

The display bridge binds only to loopback, requires a random per-session URL and
the invoking renderer origin, and accepts one viewer. Guest display credentials
are returned only through the trusted workspace IPC boundary and are not logged.
Each renderer can stop only the VM sessions it owns.

The integration tests exercise a real loopback TCP/WebSocket bridge with a
simulated Tart child, including headless flags, credentials, ownership, and
process cleanup. A real macOS boot and VNC compatibility still require a local
Tart installation and guest image. No human-speed performance claim has been
validated.
