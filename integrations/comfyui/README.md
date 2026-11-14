# ComfyUI on the KronOS canvas

Run `npm run build:comfy-editor` from the KronOS checkout to build the pinned ComfyUI frontend. Start a local ComfyUI server, then open **ComfyUI workflow** from Command Center or choose the ComfyUI catalog. KronOS connects automatically. If you use another port, enter its loopback address and select **Connect**. Use **Import** with a ComfyUI workflow JSON document or **Add node** to open the original node picker. **Export** saves the editable workflow. **Export for MCP** saves the execution format.

**Libraries** opens the ComfyUI view of the KronOS left sidebar. Choose Media Assets, Node Library, Model Library, Workflows, Apps, or Job History there. **Node Properties** opens the right inspector, and **Logs** opens the bottom panel. **Add node** and a double-click on empty canvas open ComfyUI's search in the same popup frame used by n8n.

With uv available, copy the MCP configuration from the canvas and import it in **Hermes → Capabilities → MCP**. The official local Comfy MCP runs against the same ComfyUI address. Give Hermes the path to the exported API workflow when running it through MCP.

The build mounts ComfyUI's Nodes 2.0 Vue components into the KronOS world. ComfyUI owns node definitions, widgets, links, serialization, and execution. KronOS owns the shared camera, scene selection, and stacking. Electron forwards the editor's API and job events to the configured loopback server.

ComfyUI custom Python nodes and models come from the connected server. JavaScript extensions bundled with the pinned upstream frontend load with the editor. Server-supplied JavaScript extensions require a separate execution boundary before they can run in this shared canvas.

The generated bundle includes the upstream GPL-3.0-only license. The build script pins the corresponding upstream revision and applies the adapter sources in this directory.
