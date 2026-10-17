import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Surface } from "../types";
import { MobileWorkspace } from "./mobile-workspace";

const Browser: Surface = {
    id: "browser",
    kind: "browser",
    hostId: "host",
    hostLabel: "My Mac",
    hostColor: "blue",
    title: "Project preview",
    subtitle: "https://example.test",
    status: "live",
    attention: "none",
    updatedAt: 0,
    capabilities: [],
};
const Sandbox: Surface = { ...Browser, id: "sandbox", kind: "app", title: "Linux", sandboxId: "s1" };
const Device: Surface = { ...Browser, id: "device", kind: "app", title: "This iPhone", phoneControl: true };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});
const handlers = () => ({
    onOpenSurface: vi.fn(),
    onOpenChat: vi.fn(),
    onOpenHosts: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    onOpenWidget: vi.fn().mockResolvedValue(undefined),
    onLocalTools: vi.fn(),
    onRestoreSurface: vi.fn(),
});
const click = (label: string) =>
    act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
describe("minimal workspace", () => {
    it("filters real surfaces and opens the selected browser without a redundant card header", async () => {
        const callbacks = handlers();
        await act(async () =>
            root.render(
                <MobileWorkspace
                    {...callbacks}
                    surfaces={[Browser, Sandbox, Device]}
                    hosts={[]}
                    closedSurfaces={[]}
                    refreshing={false}
                />
            )
        );
        await click("Browsers");
        expect(container.querySelectorAll(".workspace-surface-card")).toHaveLength(1);
        await click("Open Project preview on My Mac");
        expect(callbacks.onOpenSurface).toHaveBeenCalledWith(Browser);
    });
    it("opens a connected device instead of requesting a generic app sandbox", async () => {
        const callbacks = handlers();
        await act(async () =>
            root.render(
                <MobileWorkspace
                    {...callbacks}
                    surfaces={[Sandbox, Device]}
                    hosts={[]}
                    closedSurfaces={[]}
                    refreshing={false}
                />
            )
        );
        await click("Add surface");
        const deviceButton = [
            ...container.querySelectorAll<HTMLButtonElement>(".workspace-create-sheet > button"),
        ].find((button) => button.textContent?.includes("Devices"))!;
        await act(async () => deviceButton.click());
        expect(callbacks.onOpenSurface).toHaveBeenCalledWith(Device);
        expect(callbacks.onOpenWidget).not.toHaveBeenCalled();
    });
    it("keeps the modal and a useful error when no device is connected", async () => {
        const callbacks = handlers();
        await act(async () =>
            root.render(
                <MobileWorkspace
                    {...callbacks}
                    surfaces={[Sandbox]}
                    hosts={[]}
                    closedSurfaces={[]}
                    refreshing={false}
                />
            )
        );
        await click("Add surface");
        expect(container.querySelector(".mobile-workspace-main")!.hasAttribute("inert")).toBe(true);
        const deviceButton = [
            ...container.querySelectorAll<HTMLButtonElement>(".workspace-create-sheet > button"),
        ].find((button) => button.textContent?.includes("Devices"))!;
        await act(async () => deviceButton.click());
        expect(container.querySelector('[role="alert"]')!.textContent).toContain("No device is connected");
        expect(callbacks.onOpenSurface).not.toHaveBeenCalled();
        await click("Close add surface");
        expect(container.querySelector(".mobile-workspace-main")!.hasAttribute("inert")).toBe(false);
    });
});
