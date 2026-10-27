// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AgentBlockAura } from "@/app/block/agent-block-aura";
import { AgentTakeoverBar } from "@/app/block/agent-takeover-bar";
import { mountAgentCursor } from "@/util/agent-cursor-feedback";
import { useEffect, useRef, useState } from "react";

function FeedbackWidget({
    active,
    browser,
    clicks,
    onTakeOver,
}: {
    active: boolean;
    browser: boolean;
    clicks: boolean;
    onTakeOver: () => void;
}) {
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const cursor = mountAgentCursor(host.current);
        if (!active) return () => cursor.destroy();
        let step = 0;
        const move = () => {
            const width = host.current.clientWidth;
            const height = host.current.clientHeight;
            const points = [
                { x: width * 0.3, y: height * 0.32 },
                { x: width * 0.68, y: height * 0.55 },
                { x: width * 0.42, y: height * 0.7 },
            ];
            cursor.update(
                points[step % points.length],
                browser ? "Agent · Browsing the web" : "Agent · Inspecting desktop",
                clicks && step % 2 === 1
            );
            step++;
        };
        move();
        const timer = setInterval(move, 1600);
        return () => {
            clearInterval(timer);
            cursor.destroy();
        };
    }, [active, browser, clicks]);
    return (
        <section
            style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 14,
                border: "1px solid #d0d3da",
                minWidth: 0,
                background: "#fff",
                color: "#30343d",
            }}
        >
            <header style={{ height: 76, padding: 14, background: "#f2f3f6", borderBottom: "1px solid #dddfe5" }}>
                <div style={{ fontSize: 12, marginBottom: 8 }}>{browser ? "Browser" : "Computer / VM"}</div>
                <div
                    style={{ borderRadius: 6, background: "#fff", padding: "4px 12px", fontSize: 12, color: "#737987" }}
                >
                    {browser ? "Browser feedback preview" : "Guest desktop feedback preview"}
                </div>
            </header>
            <div style={{ position: "relative", height: 450 }}>
                <div style={{ padding: "42px 36px", maxWidth: 440 }}>
                    <h2 style={{ fontSize: 25, marginBottom: 18 }}>
                        {browser ? "Research workspace" : "Connected desktop"}
                    </h2>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: "#757d8d" }}>
                        The agent cursor stays separate from your pointer. Activity feedback follows the exact widget
                        being controlled.
                    </p>
                    <div
                        style={{
                            marginTop: 28,
                            border: "1px solid #e1e4eb",
                            borderRadius: 8,
                            padding: 18,
                            fontSize: 13,
                        }}
                    >
                        Page content stays clear while the edge aura is active.
                    </div>
                </div>
                <div ref={host} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
            </div>
            <AgentTakeoverBar
                blockId={browser ? "preview-feedback-browser" : "preview-feedback-desktop"}
                active={active}
                onTakeOver={onTakeOver}
            />
            <AgentBlockAura
                blockId={browser ? "preview-feedback-browser" : "preview-feedback-desktop"}
                active={active}
            />
        </section>
    );
}

export function AgentFeedbackPreview() {
    const [active, setActive] = useState(true);
    const [clicks, setClicks] = useState(false);
    return (
        <main
            style={{
                width: "min(1200px, 100%)",
                padding: 28,
                minHeight: "calc(100vh - 80px)",
                background: "#e8ebf1",
                color: "#30343d",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h1 style={{ fontSize: 20 }}>Agent cursor and aura</h1>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={clicks} onChange={(event) => setClicks(event.target.checked)} />
                    Demo clicks
                </label>
                <button
                    onClick={() => setActive(!active)}
                    style={{
                        cursor: "pointer",
                        border: "1px solid #bfc5d0",
                        borderRadius: 6,
                        padding: "8px 14px",
                        background: "#fff",
                    }}
                >
                    {active ? "Stop agent feedback" : "Start agent feedback"}
                </button>
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
                    gap: 24,
                }}
            >
                <FeedbackWidget active={active} browser clicks={clicks} onTakeOver={() => setActive(false)} />
                <FeedbackWidget active={active} browser={false} clicks={clicks} onTakeOver={() => setActive(false)} />
            </div>
        </main>
    );
}
