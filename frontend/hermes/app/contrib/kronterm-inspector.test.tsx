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
vi.mock("@hermes/app/right-sidebar", () => ({
    RightSidebarPane: ({ onOpenFile, cwd }) => (
        <button onClick={() => onOpenFile(`${cwd}/changed.ts`)}>changed.ts</button>
    ),
}));
vi.mock("./kronterm-file-editor", () => ({
    KrontermFileEditor: ({ path, onDirtyChange }) => (
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
    } finally {
        await act(async () => root.unmount());
        host.remove();
        rectSpy.mockRestore();
        $krontermInspectorOpen.set(false);
        $krontermInspectorWidth.set(null);
        $krontermInspectorCompact.set(false);
    }
});
