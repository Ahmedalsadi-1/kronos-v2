// SPDX-License-Identifier: GPL-3.0-only
// Adapted from OpenHuman NodePalette, retaining grouped click and drag insertion.
import type { WorkflowNodeKind } from "@/types/workflow-graph";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { NodeKindTile } from "./upstream/node-kind-icons";
import type { NodeKind } from "./upstream/types";
export const PaletteMime = "application/kronterm-workflow-node";
export const NodeEntries: {
    kind: WorkflowNodeKind;
    displayKind: NodeKind;
    title: string;
    description: string;
    group: string;
}[] = [
    {
        kind: "agent",
        displayKind: "agent",
        title: "Agent",
        description: "Reason, build, and verify",
        group: "Intelligence",
    },
    {
        kind: "terminal",
        displayKind: "code",
        title: "Terminal",
        description: "Work in a terminal widget",
        group: "Workspace",
    },
    {
        kind: "browser",
        displayKind: "http_request",
        title: "Browser",
        description: "Use a browser widget",
        group: "Workspace",
    },
    {
        kind: "widget",
        displayKind: "sub_workflow",
        title: "Widget",
        description: "Work with a live surface",
        group: "Workspace",
    },
    {
        kind: "review",
        displayKind: "output_parser",
        title: "Human review",
        description: "Pause and inspect evidence",
        group: "Control",
    },
];
export function NodeLibrary({ onAdd, disabled }: { onAdd: (kind: WorkflowNodeKind) => void; disabled?: boolean }) {
    const [query, setQuery] = useState("");
    const entries = NodeEntries.filter((entry) =>
        `${entry.title} ${entry.description}`.toLowerCase().includes(query.toLowerCase())
    );
    return (
        <aside className="wf-library" aria-label="Step library">
            <div className="wf-sidebar-heading">
                <span>Step library</span>
                <span className="wf-keycap">5</span>
            </div>
            <label className="wf-search">
                <Search size={14} />
                <input
                    aria-label="Search steps"
                    placeholder="Search steps…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>
            <p className="wf-sidebar-hint">Drag a step onto the canvas, or click to add.</p>
            {Array.from(new Set(entries.map((entry) => entry.group))).map((group) => (
                <section key={group} className="wf-library-group">
                    <h3>{group}</h3>
                    {entries
                        .filter((entry) => entry.group === group)
                        .map((entry) => (
                            <button
                                type="button"
                                key={entry.kind}
                                disabled={disabled}
                                draggable={!disabled}
                                className="wf-library-entry"
                                aria-label={`Add ${entry.title}`}
                                onClick={() => onAdd(entry.kind)}
                                onDragStart={(event) => {
                                    event.dataTransfer.setData(PaletteMime, entry.kind);
                                    event.dataTransfer.effectAllowed = "copy";
                                }}
                            >
                                <NodeKindTile kind={entry.displayKind} />
                                <span>
                                    <strong>{entry.title}</strong>
                                    <small>{entry.description}</small>
                                </span>
                                <Plus size={13} className="wf-add-mark" />
                            </button>
                        ))}
                </section>
            ))}
            {!entries.length && <p className="wf-sidebar-hint">No matching steps.</p>}
            <div className="wf-library-footnote">
                <span className="wf-status-dot" /> Local workspace runtime
            </div>
        </aside>
    );
}
