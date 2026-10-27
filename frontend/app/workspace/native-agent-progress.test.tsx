// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NativeAgentProgress } from "./native-agent-progress";

vi.mock("@/store/global", () => ({ getBlockComponentModel: () => undefined }));

it("renders activity outside a clipped widget and keeps it dismissed as the agent continues", async () => {
    const widget = document.createElement("div");
    widget.style.overflow = "hidden";
    document.body.append(widget);
    const root = createRoot(widget);
    try {
        await act(async () => root.render(<NativeAgentProgress blockId="activity-widget" />));
        const activity = {
            source: "hermes" as const,
            phase: "running" as const,
            surface: "terminal" as const,
            action: "inspect" as const,
            blockid: "activity-widget",
            runid: "activity-overlay-test",
            detail: "Reading local project files",
        };
        await act(async () => publishAgentActivity({ ...activity, blockid: "another-widget" }));
        expect(document.querySelector('[aria-label="Agent task progress"]')).toBeNull();
        await act(async () => publishAgentActivity(activity));
        const overlay = document.querySelector('[aria-label="Agent task progress"]');
        expect(overlay.parentElement).toBe(document.body);
        expect(widget.contains(overlay)).toBe(false);
        expect(overlay.textContent).toContain("Reading local project files");
        await act(async () => (overlay.querySelector("button") as HTMLButtonElement).click());
        expect(document.querySelector('[aria-label="Agent task progress"]')).toBeNull();
        await act(async () => publishAgentActivity({ ...activity, detail: "Still working" }));
        expect(document.querySelector('[aria-label="Agent task progress"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        widget.remove();
    }
});
