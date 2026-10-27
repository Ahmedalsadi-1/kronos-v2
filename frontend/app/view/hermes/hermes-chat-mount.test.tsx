// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HermesChatMount } from "./hermes-chat-mount";

it("keeps one conversation, draft, selection and live task mounted through HUD/panel transitions", () => {
    const host = document.createElement("div");
    const hud = document.createElement("div");
    const panel = document.createElement("div");
    hud.id = "hud";
    panel.id = "panel";
    document.body.append(host, hud, panel);
    const root = createRoot(host);
    const subscribe = vi.fn();
    const unsubscribe = vi.fn();
    function Conversation({ state }: { state: string }) {
        const [draft, setDraft] = useState("Keep this draft");
        useEffect(() => {
            subscribe();
            return unsubscribe;
        }, []);
        return (
            <>
                <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
                <button>Dock</button>
                <span role="status">{state}</span>
            </>
        );
    }
    const render = (targetId: string, state: string) =>
        act(() =>
            root.render(
                <HermesChatMount targetId={targetId}>
                    <Conversation state={state} />
                </HermesChatMount>
            )
        );
    try {
        render("hud", "Running");
        const input = hud.querySelector("input");
        input.focus();
        input.setSelectionRange(2, 6);
        for (const state of ["Awaiting approval", "Blocked", "Failed", "Cancelled", "Completed"]) {
            hud.querySelector("button").focus();
            render("panel", state);
            expect(panel.querySelector("input")).toBe(input);
            expect(input.value).toBe("Keep this draft");
            expect(document.activeElement).toBe(input);
            expect(document.querySelectorAll("[data-hermes-chat-mount]")).toHaveLength(1);
            expect(panel.querySelector("[role=status]").textContent).toBe(state);
            expect(unsubscribe).not.toHaveBeenCalled();
            input.focus();
            render("hud", state);
        }
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(6);
        expect(subscribe).toHaveBeenCalledOnce();
    } finally {
        act(() => root.unmount());
        host.remove();
        hud.remove();
        panel.remove();
    }
    expect(unsubscribe).toHaveBeenCalledOnce();
});

it("waits for an asynchronously measured OS anchor without remounting chat", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const anchor = document.createElement("div");
    anchor.id = "late-os-hud";
    try {
        act(() =>
            root.render(
                <HermesChatMount targetId={anchor.id}>
                    <input defaultValue="Draft" />
                </HermesChatMount>
            )
        );
        await act(async () => {
            document.body.append(anchor);
        });
        expect(anchor.querySelector("input")?.value).toBe("Draft");
    } finally {
        act(() => root.unmount());
        host.remove();
        anchor.remove();
    }
});
