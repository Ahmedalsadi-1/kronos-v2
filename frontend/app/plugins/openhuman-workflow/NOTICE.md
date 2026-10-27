# OpenHuman Workflow Canvas

Source: https://github.com/tinyhumansai/openhuman.git

The node cards, icon tiles, canvas toolbar, step numbering, canvas action contexts,
graph adapter, and wire types in `upstream/` were extracted and adapted
from the corresponding OpenHuman components and flow libraries. The graph adapter
and wire types were copied from the existing
`openhuman-canvas-closure/app/src/lib/flows/{graphAdapter,types}.ts` snapshot.
The editor adapts the controlled React Flow composition of OpenHuman's
`FlowCanvas.tsx` and `EditableFlowCanvas.tsx`, including vertical handles,
dotted background, minimap, drag connections, and layout conversion.
The upstream snapshot records its source in `COPIED.txt` but no commit hash;
no exact upstream revision is claimed. Retain this notice and LICENSE.
This plugin and its adaptations are distributed under GPL-3.0-only.

KronTerm owns persistence, explicit execution targets, workflow execution,
and the shared chat. No OpenHuman Tauri bridge, credentials, Redux store,
copilot UI, Rust process, or external service is started by this plugin.
