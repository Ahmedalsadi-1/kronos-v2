import { SubagentTheater } from "@hermes/app/agents/subagent-theater";
import { registerSubagentSurfaceSource } from "@hermes/lib/subagent-surface";
import type { SubagentProgress } from "@hermes/store/subagents";
import "@hermes/styles.css";
import { useState } from "react";

const Reference = "/@fs/Users/albsheralsadi/kronterm/output/subagent-theater/workspace-reference.png";
const At = new Date("2026-11-02T01:50:00-05:00").getTime();
const Agents: SubagentProgress[] = [
    {
        id: "browser-checks",
        sessionId: "preview-browser",
        parentId: null,
        goal: "Browser checks",
        model: "GPT-5.6-sol",
        status: "running",
        taskCount: 2,
        taskIndex: 0,
        startedAt: At,
        updatedAt: At,
        filesRead: [],
        filesWritten: [],
        currentTool: "Checking toolbar actions",
        stream: [
            {
                at: At + 3000,
                kind: "progress",
                text: "Finding browser controls\nScanning page for interactive elements. Located repository navigation and toolbar controls.",
            },
            {
                at: At + 8000,
                kind: "tool",
                text: "Widget Find\nUsing widget.find to identify the Code button. Found 12 candidates, selected primary Code button.",
            },
            {
                at: At + 12000,
                kind: "progress",
                text: "Scrolling repository\nUsing widget.scroll to explore repository contents.",
            },
            { at: At + 17000, kind: "tool", text: "Widget Scroll\nScrolled file list and README section into view." },
        ],
    },
    {
        id: "terminal-checks",
        parentId: null,
        goal: "Terminal checks",
        status: "completed",
        taskCount: 2,
        taskIndex: 1,
        startedAt: At,
        updatedAt: At + 15000,
        filesRead: [],
        filesWritten: [],
        stream: [{ at: At + 15000, kind: "summary", text: "Terminal tools verified." }],
    },
];
registerSubagentSurfaceSource((target, onSnapshot) => {
    if (target.id === "browser-checks") onSnapshot({ imageUrl: Reference, title: "KronTerm browser" });
    return () => {};
});

export function SubagentTheaterPreview() {
    const [open, setOpen] = useState(true);
    const [agents, setAgents] = useState(Agents);
    return (
        <div className="fixed inset-0 bg-black">
            <img src={Reference} alt="Workspace reference" className="h-full w-full object-contain" />
            <button
                className="absolute bottom-4 left-4 cursor-pointer bg-black p-3 text-white"
                onClick={() => setOpen(true)}
            >
                Open subagents
            </button>
            {open && (
                <SubagentTheater
                    agents={agents}
                    onClose={() => setOpen(false)}
                    onStop={async (selected) => {
                        setAgents((current) =>
                            current.map((agent) =>
                                agent.id === selected.id
                                    ? { ...agent, status: "interrupted", currentTool: undefined }
                                    : agent
                            )
                        );
                    }}
                />
            )}
        </div>
    );
}
