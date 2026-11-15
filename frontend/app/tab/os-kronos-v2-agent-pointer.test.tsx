// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronOSV2AgentPointer } from "./os-kronos-v2-agent-pointer";
import { KronOSV2AgentPointerEvent } from "./os-kronos-v2-agent-pointer-event";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("labels typing and scroll axes, then follows the last pointer without dropping the name tag", () => {
    vi.useFakeTimers();
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onFollow = vi.fn();
    const point = { x: 150, y: 90 };
    const report = (action: string, scrollAxis?: "x" | "y") => {
        act(() =>
            window.dispatchEvent(
                new CustomEvent(KronOSV2AgentPointerEvent, {
                    detail: { blockId: "browser", point, action, scrollAxis },
                })
            )
        );
    };
    const name = () => document.querySelector(".kronos-v2-agent-name")?.textContent;
    try {
        act(() => root.render(<KronOSV2AgentPointer onFollow={onFollow} />));
        report("type");
        expect(name()).toBe("Pip...");
        act(() => vi.advanceTimersByTime(400));
        expect(onFollow).toHaveBeenCalledWith(point);
        expect(name()).toBe("Pip");
        report("scroll", "x");
        expect(name()).toContain("Scrolling (x)");
        report("scroll", "y");
        expect(name()).toContain("Scrolling (y)");
        act(() => vi.advanceTimersByTime(2600));
        expect(name()).toBeUndefined();
    } finally {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    }
});

it("renders a browser cursor from widget activity even without a renderer pointer event", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const host = document.createElement("div");
    const widget = document.createElement("div");
    widget.dataset.liveBlockid = "browser";
    vi.spyOn(widget, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 300, 200));
    document.body.append(host, widget);
    const root = createRoot(host);
    const onFollow = vi.fn();
    try {
        act(() => root.render(<KronOSV2AgentPointer onFollow={onFollow} />));
        act(() => {
            publishAgentActivity({
                blockid: "browser",
                source: "hermes",
                surface: "browser",
                action: "scroll",
                phase: "running",
            });
        });
        expect(document.querySelector(".kronos-v2-agent-name")?.textContent).toBe("PipScrolling (y)");
        expect(document.querySelector<HTMLElement>(".kronos-v2-agent-pointer")?.style.transform).toBe(
            "translate3d(250px, 150px, 0)"
        );
        expect(onFollow).not.toHaveBeenCalled();
        const reportRun = (runid: string) =>
            act(() => {
                publishAgentActivity({
                    blockid: "browser",
                    source: "hermes",
                    surface: "browser",
                    action: "click",
                    phase: "running",
                    runid,
                });
            });
        const identity = () => [
            document.querySelector(".kronos-v2-agent-name")?.textContent,
            document
                .querySelector<HTMLElement>(".kronos-v2-agent-indicator")
                ?.style.getPropertyValue("--agent-indicator-color"),
        ];
        reportRun("first");
        const first = identity();
        reportRun("first");
        expect(identity()).toEqual(first);
        reportRun("second");
        expect(identity()[0]).not.toBe(first[0]);
        expect(identity()[1]).not.toBe(first[1]);
    } finally {
        act(() => root.unmount());
        host.remove();
        widget.remove();
        vi.unstubAllGlobals();
    }
});
