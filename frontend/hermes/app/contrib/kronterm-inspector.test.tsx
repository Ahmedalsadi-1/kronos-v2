// @vitest-environment jsdom
import {
    $krontermInspectorCompact,
    $krontermInspectorHasFiles,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorWidth,
    KRONTERM_INSPECTOR_MIN_WIDTH,
    KrontermInspectorChatEvent,
} from "@hermes/lib/kronterm-sidebar";
import { refreshReview, selectReviewFile } from "@hermes/store/review";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KrontermInspector } from "./kronterm-inspector";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/app/workflows", () => ({
    WorkflowsView: () => <main aria-label="Workflows">Workflow controls</main>,
}));
vi.mock("@hermes/app/right-sidebar", () => ({
    RightSidebarPane: ({ onOpenFile, cwd }) => (
        <button onClick={() => onOpenFile(`${cwd}/changed.ts`)}>changed.ts</button>
    ),
}));
vi.mock("./kronterm-file-preview", () => ({
    KrontermFilePreview: ({ path, onDirtyChange }) => (
        <div>
            Editable {path}
            <button onClick={() => onDirtyChange(true)}>Edit source</button>
        </div>
    ),
}));
vi.mock("@hermes/app/right-sidebar/review", () => ({ ReviewPane: () => <div>Review content</div> }));
vi.mock("@hermes/components/chat/diff-lines", () => ({ FileDiffPanel: ({ diff }) => <pre>{diff}</pre> }));
vi.mock("@hermes/components/ui/codicon", () => ({ Codicon: () => null }));
vi.mock("@hermes/lib/desktop-fs", () => ({ desktopFsProfile: () => undefined }));
vi.mock("@hermes/store/session", async () => {
    const { atom } = await import("nanostores");
    return { $currentCwd: atom("/repo") };
});
vi.mock("@hermes/store/review", async () => {
    const { atom } = await import("nanostores");
    const path = atom<string>(null);
    const diff = atom<string>(null);
    return {
        $reviewSelectedPath: path,
        $reviewDiff: diff,
        $reviewDiffLoading: atom(false),
        $reviewFiles: atom([{ path: "changed.ts", added: 1, removed: 1, status: "M", staged: false }]),
        $reviewOpen: atom(false),
        $reviewScopeCwd: atom(null),
        $reviewTreeMode: atom("tree"),
        refreshReview: vi.fn(),
        refreshShipInfo: vi.fn(),
        selectReviewFile: vi.fn(async (file) => {
            path.set(file.path);
            diff.set("-old\n+new");
        }),
    };
});

it("opens Files by default and adds Changes and Side chat from the panel menu without duplicate tabs", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = async (label: string) => {
        const button = [...host.querySelectorAll("button")].find(
            (entry) => entry.textContent === label || entry.getAttribute("aria-label") === label
        );
        expect(button).toBeTruthy();
        await act(async () => button.click());
    };
    const menuSelect = async (label: string) => {
        await act(async () =>
            host
                .querySelector('[aria-label="Add panel"]')
                .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
        );
        const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        expect(items.map((item) => item.textContent)).toEqual([
            expect.stringContaining("Changes"),
            expect.stringContaining("Files"),
            expect.stringContaining("Side chat"),
            expect.stringContaining("Nodes"),
        ]);
        await act(async () => items.find((item) => item.textContent.startsWith(label)).click());
    };
    const chat = vi.fn();
    window.addEventListener(KrontermInspectorChatEvent, chat);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
        await act(async () => {
            $krontermInspectorOpen.set(true);
            $krontermInspectorSection.set("files");
            root.render(<KrontermInspector />);
        });
        expect(refreshReview).toHaveBeenCalled();
        expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Files");
        await menuSelect("Changes");
        expect($krontermInspectorSection.get()).toBe("changes");
        await menuSelect("Changes");
        expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
        await menuSelect("Nodes");
        expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Nodes");
        expect(host.querySelector('[aria-label="Workflow nodes"]')).not.toBeNull();
        await menuSelect("Nodes");
        expect(host.querySelectorAll("#inspector-tab-workflow-nodes")).toHaveLength(1);
        await click("Close Nodes");
        expect(host.querySelector('[aria-label="Workflow nodes"]')).toBeNull();
        await act(async () => window.dispatchEvent(new Event("kronterm:workflow-chat")));
        expect($krontermInspectorSection.get()).toBe("chat");
        await menuSelect("Side chat");
        expect(chat).toHaveBeenCalled();
        expect(host.querySelector("#kronterm-inspector-chat")).toBeTruthy();
        await click("Close Side chat");
        expect($krontermInspectorSection.get()).toBe("changes");
        await click("Files");
        await click("changed.ts");
        expect($krontermInspectorSection.get()).toBe("file:/repo/changed.ts");
        expect(host.textContent).toContain("Editable /repo/changed.ts");
        expect(selectReviewFile).not.toHaveBeenCalled();
        await click("Edit source");
        await click("Files");
        await click("changed.ts");
        expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
        await click("Close changed.ts");
        expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
        await click("Keep editing");
        expect(host.textContent).toContain("Editable /repo/changed.ts");
        await act(async () =>
            host.querySelector("section").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        );
        expect($krontermInspectorOpen.get()).toBe(false);
        expect($krontermInspectorHasFiles.get()).toBe(true);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $krontermInspectorOpen.set(false);
        $krontermInspectorSection.set("files");
        window.removeEventListener(KrontermInspectorChatEvent, chat);
    }
});

it("resizes the side panel from the tab strip grip and folds it into a compact rail", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const width = { value: 400 };
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () =>
            ({
                width: width.value,
                height: 600,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect
    );
    try {
        await act(async () => {
            $krontermInspectorOpen.set(true);
            root.render(<KrontermInspector />);
        });
        const grip = host.querySelector<HTMLElement>('[role="separator"]');
        expect(grip).toBeTruthy();

        await act(async () => {
            grip.dispatchEvent(new MouseEvent("pointerdown", { clientX: 900, bubbles: true }));
            window.dispatchEvent(new MouseEvent("pointermove", { clientX: 800 }));
            window.dispatchEvent(new MouseEvent("pointerup", { clientX: 800 }));
        });
        expect($krontermInspectorWidth.get()).toBe(500);

        width.value = 500;
        await act(async () => {
            grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        });
        expect($krontermInspectorWidth.get()).toBe(516);

        width.value = 200;
        await act(async () => {
            grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        });
        expect($krontermInspectorWidth.get()).toBe(KRONTERM_INSPECTOR_MIN_WIDTH);

        const compactButton = [...host.querySelectorAll("button")].find(
            (entry) => entry.getAttribute("aria-label") === "Compact side panel"
        );
        expect(compactButton).toBeTruthy();
        await act(async () => compactButton.click());
        expect($krontermInspectorCompact.get()).toBe(true);
        expect(host.querySelector("section").className).toContain("is-compact");
        await act(async () => host.querySelector<HTMLButtonElement>('[role="tab"]').click());
        expect($krontermInspectorCompact.get()).toBe(false);
        expect($krontermInspectorWidth.get()).toBe(KRONTERM_INSPECTOR_MIN_WIDTH);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        rectSpy.mockRestore();
        $krontermInspectorOpen.set(false);
        $krontermInspectorWidth.set(null);
        $krontermInspectorCompact.set(false);
    }
});

it("scopes original node and execution mounts to the active workflow and keeps them mutually visible", async () => {
    const { $workflowContext } = await import("@hermes/app/workflows/workflow-context");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const picker = vi.fn();
    const execution = vi.fn();
    const opened = vi.fn();
    window.addEventListener("kronterm:workflow-open", opened);
    window.addEventListener("kronterm:original-node-picker", picker);
    window.addEventListener("kronterm:workflow-surface", execution);
    const context = (hasExecutions: boolean) =>
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-context", {
                detail: { tabId: "tab-a", workflowId: "flow-a", hasExecutions },
            })
        );
    const show = (section: string, tabId = "tab-a") =>
        window.dispatchEvent(new CustomEvent("kronterm:workflow-inspector", { detail: { section, tabId } }));
    try {
        await act(async () => {
            $krontermInspectorOpen.set(true);
            $krontermInspectorSection.set("files");
            root.render(<KrontermInspector />);
        });
        await act(async () => context(false));
        await act(async () => show("workflow-nodes", "other-tab"));
        expect($krontermInspectorSection.get()).toBe("files");
        expect(opened).not.toHaveBeenCalled();
        await act(async () => show("workflow-nodes"));
        expect(opened.mock.calls.at(-1)[0].detail).toEqual({ tabId: "tab-a", surface: "canvas" });
        expect(picker.mock.calls.at(-1)[0].detail).toMatchObject({ tabId: "tab-a", target: expect.any(HTMLElement) });
        await act(async () => show("workflow-executions"));
        expect($krontermInspectorSection.get()).toBe("workflow-nodes");
        await act(async () => context(true));
        await act(async () => show("workflow-executions"));
        expect(execution.mock.calls.at(-1)[0].detail).toMatchObject({
            surface: "executions",
            tabId: "tab-a",
            workflowId: "flow-a",
            target: expect.any(HTMLElement),
        });
        expect(host.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
        expect(host.querySelector('[role="tabpanel"]:not([hidden])').id).toBe("inspector-pane-workflow-executions");
        await act(async () => show("workflow-nodes"));
        expect(execution.mock.calls.at(-1)[0].detail).toMatchObject({ tabId: "tab-a", target: null });
        await act(async () => context(false));
        expect(host.querySelector("#inspector-tab-workflow-executions")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $workflowContext.set({});
        $krontermInspectorSection.set("files");
        $krontermInspectorOpen.set(false);
        window.removeEventListener("kronterm:original-node-picker", picker);
        window.removeEventListener("kronterm:workflow-surface", execution);
        window.removeEventListener("kronterm:workflow-open", opened);
    }
});

it("temporarily compacts only the matching Nodes rail while original node details are open", async () => {
    const { $workflowContext } = await import("@hermes/app/workflows/workflow-context");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const visibility = (open: boolean, tabId = "tab-a") =>
        act(async () => {
            window.dispatchEvent(new CustomEvent("kronterm:workflow-details-visibility", { detail: { tabId, open } }));
        });
    try {
        await act(async () => {
            $workflowContext.set({ tabId: "tab-a", hasExecutions: true });
            $krontermInspectorOpen.set(true);
            $krontermInspectorSection.set("workflow-nodes");
            $krontermInspectorCompact.set(false);
            $krontermInspectorWidth.set(480);
            root.render(<KrontermInspector />);
        });
        await visibility(true, "tab-b");
        expect($krontermInspectorCompact.get()).toBe(false);
        await visibility(true);
        expect(host.querySelector(".kronterm-inspector")?.classList.contains("is-compact")).toBe(true);
        expect($krontermInspectorWidth.get()).toBe(480);
        await visibility(false);
        expect($krontermInspectorCompact.get()).toBe(false);
        expect($krontermInspectorWidth.get()).toBe(480);
        await visibility(true);
        await act(async () => $krontermInspectorCompact.set(false));
        await visibility(true);
        expect($krontermInspectorCompact.get()).toBe(false);
        await visibility(false);
        expect($krontermInspectorCompact.get()).toBe(false);
        for (const section of ["files", "chat", "workflow-executions"] as const) {
            await act(async () => $krontermInspectorSection.set(section));
            await visibility(true);
            expect($krontermInspectorCompact.get()).toBe(false);
            await visibility(false);
        }
        await act(async () => $krontermInspectorSection.set("workflow-nodes"));
        await visibility(true);
        await act(async () => $krontermInspectorSection.set("chat"));
        await visibility(false);
        expect($krontermInspectorSection.get()).toBe("chat");
        expect($krontermInspectorCompact.get()).toBe(true);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $krontermInspectorCompact.set(false);
        $krontermInspectorOpen.set(false);
        $workflowContext.set({});
    }
});

it("keeps the Nodes picker selected when OS handles opening execution history below the canvas", async () => {
    const { $workflowContext } = await import("@hermes/app/workflows/workflow-context");
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const openDock = vi.fn((event: Event) => {
        (event as CustomEvent).detail.handled = true;
    });
    window.addEventListener("kronterm:workflow-executions-dock-open", openDock);
    try {
        await act(async () => {
            $workflowContext.set({ tabId: "tab-a", workflowId: "flow-a", hasExecutions: true });
            $krontermInspectorOpen.set(true);
            $krontermInspectorCompact.set(false);
            $krontermInspectorSection.set("workflow-nodes");
            root.render(<KrontermInspector />);
        });
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-inspector", {
                    detail: { tabId: "tab-a", section: "workflow-executions" },
                })
            )
        );
        expect(openDock).toHaveBeenCalledTimes(1);
        expect((openDock.mock.calls[0][0] as CustomEvent).detail.tabId).toBe("tab-a");
        expect($krontermInspectorSection.get()).toBe("workflow-nodes");
        expect($krontermInspectorOpen.get()).toBe(true);
        expect($krontermInspectorCompact.get()).toBe(false);
        expect(element.textContent).not.toContain("Execution history is open below the canvas");
    } finally {
        await act(async () => root.unmount());
        window.removeEventListener("kronterm:workflow-executions-dock-open", openDock);
        $krontermInspectorOpen.set(false);
        $workflowContext.set({});
        element.remove();
    }
});
