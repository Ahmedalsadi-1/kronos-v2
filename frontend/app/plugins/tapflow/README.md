# Tapflow Mobile Labs

Tapflow is a bundled Hermes plugin (`tapflow`) plus a native KronTerm control
widget (`plugin:kronterm.tapflow/devices`). Open it from the widget launcher or
Hermes command palette: "Tapflow: Open mobile workspace". Toggle it through
Hermes Settings > Plugins. The plugin panel links to Skills > MCP for its tools.

Each saved iPhone/Android watch session opens as an independent canonical web
block, so the existing widgets, tabs, canvas, and OS layouts can place it.
Settings, tokens, team, resources, App Center, and automation runs also open as
separate browser widgets. Relay authentication stays in the browser; tokens are
never stored in block metadata. Sessions and relay origin persist on the control
block. Removing a saved session does not disconnect a device or close its widget.

Watch URLs come from Tapflow MCP's `connect_device` result. These views are
read-only. Use App Center for interactive manual QA. This initial adapter uses
upstream pages; it does not yet extract the bare device canvas or migrate the
existing Computers view. Existing mobile implementations remain available until
the replacement is verified with a connected relay.

Bot farm mode selects sessions and prepares a structured task in Hermes. The
user submits it in chat. Automatic provisioning, parallel scheduling, exclusive
device leases, cancellation, and per-device run reconciliation are not yet
implemented. Do not describe task preparation as a deployed farm.

Upstream: https://github.com/jo-duchan/tapflow (MIT).
