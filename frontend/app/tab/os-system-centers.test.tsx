// @vitest-environment jsdom
import { atom } from "jotai";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OSSystemCenterPanel, OSWorktreeChangesSection } from "./os-system-centers";

const mocks = vi.hoisted(() => ({ changes: vi.fn(), diff: vi.fn(), model: null as any }));
vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: { OSWorktreeChangesCommand: mocks.changes, OSWorktreeFileDiffCommand: mocks.diff },
}));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/app/store/os-system", () => ({ OSSystemModel: { getInstance: () => mocks.model } }));
vi.mock("@/store/global", async () => {
    const { atom } = await import("jotai");
    const settings = atom(false);
    return { atoms: {}, getSettingsKeyAtom: () => settings, getApi: vi.fn(), createBlock: vi.fn() };
});
vi.mock("@/app/components/computer-use-status-card", () => ({ ComputerUseControlEvent: "computer-control" }));
vi.mock("@/app/store/os-resource-service", () => ({
    attachOSResourceToKronos: vi.fn(),
    quickLookOSResource: vi.fn(),
    revealOSResource: vi.fn(),
}));
vi.mock("@/app/store/contextmenu", () => ({ ContextMenuModel: { getInstance: vi.fn() } }));
vi.mock("@/app/view/kronsettings/kronsettings-theme-presets", () => ({ applyCustomAccent: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
function deferred<T>() {
    let resolve: (value: T) => void;
    let reject: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
}
async function render(element: React.ReactNode) {
    await act(async () => root.render(element));
}
async function click(button: Element) {
    await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.model = { eventsAtom: atom([]), loadStateAtom: atom("ready"), activeSpaceIdAtom: atom("space") };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.replaceChildren();
});

describe("OS changes review", () => {
    it("does not claim a clean tree during loading or errors and can retry", async () => {
        const first = deferred<any[]>();
        mocks.changes.mockReturnValueOnce(first.promise).mockResolvedValueOnce([]);
        await render(<OSWorktreeChangesSection root="/repo" />);
        expect(container.textContent).toContain("Reading uncommitted changes");
        expect(container.textContent).not.toContain("No uncommitted changes");
        await act(async () => first.reject(new Error("offline")));
        expect(container.querySelector('[role="alert"]')?.textContent).toContain("Retry");
        expect(container.textContent).not.toContain("No uncommitted changes");
        await click(container.querySelector('[aria-label="Refresh changes"]')!);
        expect(container.textContent).toContain("No uncommitted changes");
    });

    it("ignores a late diff for a previously selected file", async () => {
        mocks.changes.mockResolvedValue([
            { path: "a.ts", status: "modified", insertions: 1, deletions: 0 },
            { path: "b.ts", status: "modified", insertions: 1, deletions: 0 },
        ]);
        const a = deferred<string>();
        const b = deferred<string>();
        mocks.diff.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
        await render(<OSWorktreeChangesSection root="/repo" />);
        const rows = container.querySelectorAll(".os-change-row");
        await click(rows[0]);
        await click(rows[1]);
        await act(async () => b.resolve("B diff"));
        await act(async () => a.resolve("A diff"));
        expect(container.querySelector("pre")?.textContent).toBe("B diff");
    });

    it("ignores changes from a previous root", async () => {
        const old = deferred<any[]>();
        mocks.changes.mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
        await render(<OSWorktreeChangesSection root="/old" />);
        await render(<OSWorktreeChangesSection root="/new" />);
        await act(async () => old.resolve([{ path: "old.ts", status: "modified" }]));
        expect(container.textContent).not.toContain("old.ts");
        expect(container.textContent).toContain("No uncommitted changes");
    });
});

describe("OS center keyboard behavior", () => {
    it("focuses the center, consumes Escape, and restores the launcher", async () => {
        const launcher = document.createElement("button");
        document.body.append(launcher);
        launcher.focus();
        const onClose = vi.fn();
        await render(
            <OSSystemCenterPanel center="activity" onClose={onClose} onFocusBlock={vi.fn()} onPinResource={vi.fn()} />
        );
        const close = container.querySelector('[aria-label="Close activity center"]')!;
        expect(document.activeElement).toBe(close);
        const outsideEscape = vi.fn();
        window.addEventListener("keydown", outsideEscape);
        await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(onClose).toHaveBeenCalledOnce();
        expect(outsideEscape).not.toHaveBeenCalled();
        window.removeEventListener("keydown", outsideEscape);
        await render(null);
        expect(document.activeElement).toBe(launcher);
    });

    it("preserves focus intentionally moved to another app", async () => {
        const launcher = document.createElement("button");
        const app = document.createElement("button");
        document.body.append(launcher, app);
        launcher.focus();
        await render(
            <OSSystemCenterPanel center="activity" onClose={vi.fn()} onFocusBlock={vi.fn()} onPinResource={vi.fn()} />
        );
        app.focus();
        await render(null);
        expect(document.activeElement).toBe(app);
    });
});
