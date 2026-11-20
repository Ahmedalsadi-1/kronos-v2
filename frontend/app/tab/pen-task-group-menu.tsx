// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PenTaskGroup } from "./pen-task-history";
import type { PenChatDockTab } from "./os-pen-chat-dock-model";

export function PenTaskGroupMenu({ group, tabs, keptTabs, collapsed, onToggle, onKeep, onOpen, onClose }: {
    group: PenTaskGroup;
    tabs: PenChatDockTab[];
    keptTabs: string[];
    collapsed: boolean;
    onToggle: () => void;
    onKeep: (id: string) => void;
    onOpen: (id: string) => void;
    onClose: (ids: string[]) => Promise<void>;
}) {
    const [anchor, setAnchor] = useState<HTMLSpanElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const owned = tabs.filter(({ id }) => group.tabIds.includes(id) && !keptTabs.includes(id));
    const openTab = (id: string) => { menu.current?.hidePopover(); onOpen(id); };
    const buttonStyle = { cursor: "pointer", padding: "6px 8px", border: "1px solid #555", borderRadius: 6, background: "#303030", color: "inherit" };
    return <span ref={setAnchor} data-task-group={group.id} style={{ display: "inline-flex", alignItems: "center", flex: "none", gap: 3 }}>
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} title={group.title}
            style={{ ...buttonStyle, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#d4c4ff" }}>
            {collapsed ? "▸" : "▾"} {group.title} · {owned.length}
        </button>
        <button type="button" aria-label={`Timeline and tabs: ${group.title}`} style={buttonStyle} onClick={() => {
            const bounds = anchor.getBoundingClientRect();
            Object.assign(menu.current.style, {
                top: `${bounds.bottom + 6}px`,
                left: `${Math.max(8, Math.min(bounds.left, anchor.ownerDocument.documentElement.clientWidth - 410))}px`,
            });
            menu.current.showPopover();
        }}>⋯</button>
        {anchor && createPortal(<div ref={menu} popover="auto" aria-label={`Task history: ${group.title}`}
            style={{ position: "fixed", margin: 0, width: 390, maxWidth: "calc(100vw - 16px)", maxHeight: "min(640px, 80vh)", overflow: "auto", padding: 14, border: "1px solid #555", borderRadius: 10, background: "#242424", color: "#eee", boxShadow: "0 12px 30px #0006", font: "13px/1.45 -apple-system, sans-serif" }}>
            <strong style={{ display: "block", fontSize: 15 }}>{group.title}</strong>
            <p style={{ color: "#bbb", margin: "6px 0 12px" }}>{group.status} · {owned.length} task tabs</p>
            {owned.map((tab) => <div key={tab.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button style={{ ...buttonStyle, flex: 1, textAlign: "left" }} onClick={() => openTab(tab.id)}>{tab.title || tab.app}</button>
                <button style={buttonStyle} onClick={() => onKeep(tab.id)}>Keep tab</button>
            </div>)}
            {owned.length > 0 && <button style={buttonStyle} onClick={() => void onClose(owned.map(({ id }) => id))}>Close task tabs</button>}
            <h3 style={{ margin: "16px 0 8px", fontWeight: 600 }}>Timeline</h3>
            {!group.actions.length && <p>Actions will appear as the task works.</p>}
            <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 12px", borderLeft: "1px solid #735e9c" }}>
                {group.actions.map((action) => <li key={action.id} style={{ marginBottom: 16 }}>
                    <time style={{ color: "#aaa", fontSize: 11 }}>{new Date(action.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                    <div style={{ fontWeight: 600 }}>{action.title}</div>
                    <div style={{ color: action.status === "failed" ? "#f4a5a5" : "#aaa", fontSize: 12 }}>{action.status}</div>
                    {action.image && <img src={action.image} alt={`Captured after ${action.title}`} style={{ width: "100%", marginTop: 6, borderRadius: 5 }} />}
                    {action.result && <details><summary style={{ cursor: "pointer" }}>Result</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{action.result}</pre></details>}
                    {tabs.some(({ id }) => id === action.blockId) && <button style={{ ...buttonStyle, marginTop: 6 }} onClick={() => openTab(action.blockId)}>Open tab</button>}
                </li>)}
            </ol>
        </div>, anchor.ownerDocument.body)}
    </span>;
}
