import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSnapshot, Surface } from "../types";
import { FocusedSurface } from "./focused-surface";

vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: vi.fn() }));

const SurfaceFixture = {
    id: "first",
    kind: "app",
    title: "Computer",
    hostLabel: "Host",
    hostColor: "blue",
    sandboxId: "sandbox",
    hostId: "host",
    subtitle: "Sandbox desktop",
    status: "live",
    attention: "none",
    updatedAt: 0,
    capabilities: ["stop"],
} satisfies Surface;
let root: Root;
let container: HTMLDivElement;
const callbacks = () => ({
    onBack: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onBrowserSnapshot: vi.fn().mockResolvedValue({ items: [] }),
    onBrowserAction: vi.fn().mockResolvedValue(undefined),
    onSandboxAction: vi.fn().mockResolvedValue(undefined),
    onTerminalSubscribe: vi.fn(() => vi.fn()),
    onTerminalInput: vi.fn().mockResolvedValue(undefined),
    onTerminalResize: vi.fn().mockResolvedValue(undefined),
    onControlMode: vi.fn(),
    onAskKronos: vi.fn(),
    onStop: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
});

async function enterText(text: string) {
    const input = container.querySelector<HTMLInputElement>('[aria-label="Text for the focused app"]')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const submitText = () =>
    act(async () => {
        container
            .querySelector(".sandbox-keyboard")!
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

describe("focused mobile surface", () => {
    it("checks the real lease time before sending input, even before the UI timer catches up", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const handlers = callbacks();
        await act(async () =>
            root.render(
                <FocusedSurface
                    {...handlers}
                    surface={SurfaceFixture}
                    loading={false}
                    controlMode="takeover"
                    leaseEndsAt={1_500}
                />
            )
        );
        await enterText("hello");
        vi.setSystemTime(1_501);
        await submitText();
        expect(handlers.onSandboxAction).not.toHaveBeenCalled();
    });

    it("keeps failed input for retry and exposes the control error to assistive technology", async () => {
        const handlers = callbacks();
        handlers.onSandboxAction.mockRejectedValue(new Error("Device disconnected"));
        await act(async () =>
            root.render(
                <FocusedSurface {...handlers} surface={SurfaceFixture} loading={false} controlMode="takeover" />
            )
        );
        await enterText("keep this");
        await submitText();
        expect(container.querySelector<HTMLInputElement>('[aria-label="Text for the focused app"]')!.value).toBe(
            "keep this"
        );
        expect(container.querySelector('[role="alert"]')!.textContent).toContain("Device disconnected");
        expect(container.querySelector('[aria-pressed="true"]')!.textContent).toContain("Take control");
    });

    it("discards page controls that arrive after switching surfaces", async () => {
        const handlers = callbacks();
        let resolveSnapshot!: (value: BrowserSnapshot) => void;
        handlers.onBrowserSnapshot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSnapshot = resolve;
                })
        );
        const renderSurface = (id: string) =>
            act(async () =>
                root.render(
                    <FocusedSurface
                        {...handlers}
                        surface={{ ...SurfaceFixture, id, kind: "browser" }}
                        loading={false}
                        controlMode="watch"
                    />
                )
            );
        await renderSurface("first");
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show page controls"]')!.click());
        await renderSurface("second");
        await act(async () =>
            resolveSnapshot({ items: [{ uid: "old", role: "button", name: "Stale first page" }] } as BrowserSnapshot)
        );
        handlers.onBrowserSnapshot.mockResolvedValue({ items: [] });
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show page controls"]')!.click());
        expect(container.textContent).not.toContain("Stale first page");
        expect(container.textContent).toContain("No interactive controls found");
    });
});
