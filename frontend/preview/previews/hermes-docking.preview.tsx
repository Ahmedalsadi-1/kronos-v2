import { HermesChatMount } from "@/app/view/hermes/hermes-chat-mount";
import { HermesHudFrame } from "@/app/view/hermes/hermes-hud-overlay";
import "@hermes/styles.css";
import { useState } from "react";

function PreviewConversation() {
    const [draft, setDraft] = useState("Inspect the current workspace");
    return (
        <div
            data-hermes-app=""
            className="flex h-full min-h-0 flex-col border border-neutral-700 bg-neutral-950 p-4 text-neutral-100"
        >
            <header className="flex justify-between border-b border-neutral-700 pb-3 text-sm">
                <span>KronTerm Agent</span>
                <span>ACP</span>
            </header>
            <div className="flex-1 overflow-auto py-4 text-sm">
                <p className="mb-3 text-neutral-400">Conversation fixture</p>
                <div className="rounded-xl border border-neutral-700 p-3">Inspect the current workspace.</div>
                <div className="mt-3 rounded-xl border border-neutral-700 p-3">
                    Ready to inspect the selected surface.
                </div>
            </div>
            <div data-slot="composer-surface" className="rounded-xl border border-neutral-700 p-3">
                <textarea
                    aria-label="Draft"
                    className="h-20 w-full resize-none rounded-lg bg-transparent text-sm focus-visible:outline-2"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                />
                <button
                    className="cursor-pointer rounded-full border border-neutral-600 px-3 py-1 text-xs"
                    onClick={() => setDraft("")}
                >
                    Clear draft
                </button>
            </div>
        </div>
    );
}

export function HermesDockingPreview() {
    const [panel, setPanel] = useState(false);
    const [mode, setMode] = useState("os");
    return (
        <div className="dark fixed inset-x-0 bottom-0 top-10 flex flex-col bg-neutral-900 p-4 text-neutral-100">
            <header className="mb-4 flex flex-wrap items-center gap-4 text-sm">
                <label>
                    Layout{" "}
                    <select aria-label="Layout" value={mode} onChange={(event) => setMode(event.target.value)}>
                        {["widgets", "tabs", "canvas", "os"].map((value) => (
                            <option key={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <button className="cursor-pointer border px-3 py-1" onClick={() => setPanel(!panel)}>
                    {panel ? "Return to HUD" : "Open side panel"}
                </button>
                <span className="text-xs text-neutral-400">Docking and corner-style fixture; no agent runtime</span>
            </header>
            <main className="relative flex min-h-0 flex-1 border border-neutral-700" data-workspace-presentation={mode}>
                <div className="min-w-0 flex-1 p-4 text-sm text-neutral-400">{mode} workspace</div>
                {panel && (
                    <aside className="hermes-workspace-panel h-full w-[390px] max-w-full shrink-0">
                        <div id="preview-chat-panel" className="h-full" />
                    </aside>
                )}
                {!panel && (
                    <HermesHudFrame
                        geometry={{
                            x: 32,
                            y: 110,
                            width: Math.min(390, window.innerWidth - 64),
                            height: Math.min(580, window.innerHeight - 150),
                        }}
                    >
                        <div id="preview-chat-hud" className="pointer-events-auto h-full" />
                    </HermesHudFrame>
                )}
                <HermesChatMount targetId={panel ? "preview-chat-panel" : "preview-chat-hud"}>
                    <PreviewConversation />
                </HermesChatMount>
            </main>
        </div>
    );
}
