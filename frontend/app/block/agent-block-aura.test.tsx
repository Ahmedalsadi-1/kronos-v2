// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishAgentActivity } from "../../types/agent-activity";
import { AgentBlockAura } from "./agent-block-aura";

vi.mock("@/app/view/use-reduced-agent-motion", () => ({ useReducedAgentMotion: () => true }));

describe("agent block aura", () => {
    let root: Root;
    let container: HTMLDivElement;
    const render = (enabled = true, active = false) =>
        act(() => root.render(<AgentBlockAura blockId="browser-block" enabled={enabled} active={active} />));
    const aura = () => container.querySelector(".agent-block-aura");
    const emit = (blockid: string, phase: "running" | "paused" | "succeeded" = "running") =>
        act(() => {
            publishAgentActivity({
                runid: "browser-run",
                phase,
                source: "mcp",
                surface: "browser",
                blockid,
                action: "click",
                point: { x: 100, y: 100 },
            });
        });

    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        root = createRoot(container);
        render();
    });
    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
    });

    it("lights only the targeted block and clears on human takeover", () => {
        emit("other-block");
        expect(aura().hasAttribute("data-active")).toBe(false);
        emit("browser-block");
        expect(aura().hasAttribute("data-active")).toBe(true);
        emit("browser-block", "paused");
        expect(aura().hasAttribute("data-active")).toBe(false);
    });

    it("clears the aura on completion while cursor feedback is settling", () => {
        emit("browser-block");
        emit("browser-block", "succeeded");
        expect(aura().hasAttribute("data-active")).toBe(false);
    });

    it("respects disabled aura even while a tool is active", () => {
        render(false);
        emit("browser-block");
        expect(aura().hasAttribute("data-active")).toBe(false);
        render(true);
        expect(aura().hasAttribute("data-active")).toBe(true);
    });

    it("supports legacy widget actions and the reduced-motion preference", () => {
        render(true, true);
        expect(aura().hasAttribute("data-active")).toBe(true);
        expect(aura().hasAttribute("data-reduced-motion")).toBe(true);
        expect(aura().getAttribute("aria-hidden")).toBe("true");
    });

    it("lights the outer frame for resolved pointer events without a running stream", () => {
        act(() =>
            window.dispatchEvent(
                new CustomEvent("kron-agent-pointer", {
                    detail: { blockId: "browser-block", point: { x: 140, y: 80 }, action: "click" },
                })
            )
        );
        expect(aura().hasAttribute("data-active")).toBe(true);
        act(() => vi.advanceTimersByTime(3001));
        expect(aura().hasAttribute("data-active")).toBe(false);
    });

    it("expires activity when a tool does not send a completion event", () => {
        emit("browser-block");
        act(() => vi.advanceTimersByTime(15_001));
        expect(aura().hasAttribute("data-active")).toBe(false);
    });
});
