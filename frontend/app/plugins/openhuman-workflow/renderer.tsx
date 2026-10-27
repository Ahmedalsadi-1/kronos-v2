// SPDX-License-Identifier: GPL-3.0-only
import { createRoot } from "react-dom/client";
import { makeInitialGraph } from "./graph";
import { WorkflowCanvas } from "./workflow-canvas";
const storageKey = "kronterm.workflow-plugin.document.v1";
let saved;
try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
} catch {
    saved = null;
}
createRoot(document.getElementById("root")).render(
    <WorkflowCanvas
        initialGraph={saved?.graph ?? makeInitialGraph()}
        initialTitle={saved?.title}
        onSave={async (graph, title) => {
            localStorage.setItem(storageKey, JSON.stringify({ graph, title }));
        }}
    />
);
