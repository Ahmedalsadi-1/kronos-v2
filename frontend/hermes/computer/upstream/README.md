# Computer viewer source

Adapted from [Hermes Bot Kit](https://github.com/thomasbek3/hermes-bot-kit), commit
`4bfdd1bf3c7ad20458e4793666550af760b76d97` (MIT; see LICENSE).

KronTerm mounts `ComputerPane` in its existing desktop block (`linux-vms`, retained
as a compatibility identifier), rather than registering a Hermes sidebar pane.
Preview and fullscreen use the same connection. Per-profile computer bindings,
connection setup, VNC controls, H.264 overlay, reconnect handling and last-frame
snapshots retain the upstream implementation.

Local changes:

- Use the installed noVNC package, bundled by Vite; no downloaded executable modules.
- Remove the upstream demo endpoint and hard-coded password.
- Expose mount, settings and wake functions; leave widget visibility to KronTerm.
- Use live gateway tool events instead of observing transcript DOM for auto-open.
- Ignore Hermes pane-visibility state, which does not own KronTerm blocks.
- Mount the fullscreen overlay with the widget and use React DOM portals directly.

The Computer widget discovers the existing Ubuntu VM automatically. A running VM
gets an x11vnc service attached to its existing Xvfb display `:1`, including older
VMs created before this integration. Guest VNC listens only on loopback; a
token-protected local WebSocket bridge carries it over authenticated SSH. The
widget registers that endpoint automatically and defaults to it when no other
computer was selected. Setup runs asynchronously after the desktop is ready and
retries on failure; no URL or password needs to be copied. The VM toolbar retains
Prepare, Start and Stop controls. External computers can still be added manually.

Bot Sections also appears in the regular left sidebar, above the session list,
with a visible Computer launcher. The separate Bot Mode pane remains available.

## Optional bot control

The `orgo-computer` Python agent plugin is bundled alongside `kronterm-tools` and
staged into the managed plugin tree. Enable it in the relevant Hermes profile's
`plugins.enabled`, set `ORGO_API_KEY` in that profile's environment, and use
`/computer` to pin its Orgo computer. Select the same computer in the viewer's
per-bot settings. Remote viewing alone does not grant the bot shell access to an
arbitrary VNC machine. The optional hosted Orgo run remains off by default.

For local, Docker and other remote targets, retain the appropriate existing
KronTerm/SSH tools or install a compatible control bridge. VNC provides viewing
and user input; it is not a shell protocol.

The packaged host scripts are in `hermes-computer-kit` in application resources.
Passwords and endpoint tokens follow upstream plugin storage behavior. Keep host
bridges on loopback, a trusted LAN, or Tailscale; use TLS for public endpoints.

## Managed computer providers

Managed VM desktops now use a per-widget noVNC connection rather than the
upstream singleton engine. This supports multiple VM widgets concurrently and
preserves their connections in fullscreen. This upstream engine remains the
external VNC/noVNC endpoint manager, available in Settings → Computers.

Settings → Computers and Settings → Plugins expose the provider registry.
The composer Computer menu beside the agent selector enables a selected sandbox
for the local KronTerm Agent. The active grant applies to its workspace and is
cleared on app restart. See `emain/computer-plugins/README.md` for provider,
transport and tool-scope details. Image preparation remains an explicit action;
Start and the composer menu boot already prepared computers.
