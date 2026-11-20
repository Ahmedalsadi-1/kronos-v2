// @vitest-environment jsdom
import { registerSubagentSurfaceSource } from "@hermes/lib/subagent-surface";
import { $subagentsBySession, upsertSubagent } from "@hermes/store/subagents";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSPenActivityPreview, type PenActivityRun } from "./os-pen-activity-preview";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("shows one preview, filters the main task in split view, and opens the selected worker's widget", async () => {
    const oldWorkers = $subagentsBySession.get();
    $subagentsBySession.set({});
    const frame = document.body.appendChild(document.createElement("iframe"));
    const editor = frame.contentDocument;
    editor.body.innerHTML = '<div data-kronos-agent-preview="chat"></div><div data-kronos-agent-preview="chat"></div>';
    for (const slot of editor.querySelectorAll<HTMLElement>("[data-kronos-agent-preview]")) {
        slot.getClientRects = () => [{ width: 240, height: 1 }] as unknown as DOMRectList;
    }
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const showModal = HTMLDialogElement.prototype.showModal;
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
        this.open = false;
    };
    const stopCapture = vi.fn();
    const capture = vi.fn((target, publish) => {
        if (target.id === "worker")
            publish({
                targetKey: "worker-browser",
                blockId: "worker-browser",
                imageUrl: "data:image/png;base64,YQ==",
            });
        return stopCapture;
    });
    registerSubagentSurfaceSource(capture);
    const openWidget = vi.fn(async () => true);
    const openTheater = vi.fn();
    const runs = new Map<string, PenActivityRun>([
        [
            "chat",
            {
                since: Date.now() - 1000,
                sessionId: "runtime",
                rows: [
                    {
                        id: "main",
                        goal: "Parent task",
                        status: "running",
                        detail: "Reviewing results",
                        imageUrl: "data:image/png;base64,YQ==",
                        blockId: "main-browser",
                        since: 1,
                    },
                ],
            },
        ],
    ]);
    try {
        await act(async () =>
            root.render(
                <OSPenActivityPreview
                    editorDocument={editor}
                    runs={runs}
                    onOpenWidget={openWidget}
                    onOpenTheater={openTheater}
                />
            )
        );
        expect(editor.querySelectorAll(".pen-activity-compact")).toHaveLength(1);
        expect(editor.querySelector(".pen-activity-caption")?.textContent).toBe("Reviewing results");
        expect(document.querySelector(".pen-activity-dialog")).toBeNull();

        await act(async () => editor.documentElement.setAttribute("data-kronos-chat-split", ""));
        expect(editor.querySelector(".pen-activity-compact")).toBeNull();
        await act(async () =>
            upsertSubagent("runtime", {
                subagent_id: "worker",
                goal: "Review editorial sites",
                status: "running",
                tool_name: "browser_search",
            })
        );
        expect(editor.querySelectorAll(".pen-activity-compact")).toHaveLength(1);
        expect(editor.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,YQ==");

        await act(async () => editor.querySelector<HTMLButtonElement>(".pen-activity-thumbnail").click());
        expect(editor.querySelector<HTMLElement>(".pen-activity-compact").style.visibility).toBe("hidden");
        const expanded = document.querySelector<HTMLDialogElement>(".pen-activity-dialog");
        expect(expanded.open).toBe(true);
        expect(expanded.querySelector(".pen-activity-tool")?.textContent).toContain("browser search");
        await act(async () => expanded.querySelector<HTMLButtonElement>('[aria-label="Open widget as tab"]').click());
        expect(openWidget).toHaveBeenCalledExactlyOnceWith("worker-browser");
        expect(document.querySelector(".pen-activity-dialog")).toBeNull();

        await act(async () => editor.documentElement.removeAttribute("data-kronos-chat-split"));
        const picker = editor.querySelector<HTMLSelectElement>('[aria-label="Preview task"]');
        expect(Array.from(picker.options, (option) => option.value)).toEqual(["main", "worker"]);
    } finally {
        await act(async () => root.unmount());
        HTMLDialogElement.prototype.showModal = showModal;
        HTMLDialogElement.prototype.close = close;
        registerSubagentSurfaceSource(() => () => {});
        $subagentsBySession.set(oldWorkers);
        frame.remove();
        host.remove();
    }
});
