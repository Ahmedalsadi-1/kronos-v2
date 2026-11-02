// @vitest-environment jsdom
import { $workflowSidebarMode } from "@hermes/app/workflows/workflow-context";
import {
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    registerKrontermSidebarOwner,
} from "@hermes/lib/kronterm-sidebar";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { KrontermSidebar } from "./kronterm-sidebar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@hermes/app/workflows", () => ({ WorkflowsView: () => <div>Workflow folders</div> }));
vi.mock("@hermes/components/ui/sidebar", () => ({ SidebarProvider: ({ children }) => children }));
vi.mock("./kronterm-inspector", () => ({ KrontermInspector: () => <div>Inspector</div> }));
vi.mock("@hermes/store/layout", async () => {
    const { atom } = await import("nanostores");
    return { $sidebarOpen: atom(true), setSidebarOpen: vi.fn() };
});

afterEach(() => {
    $krontermSidebarTarget.set(null);
    $workflowSidebarMode.set("sessions");
    document.body.replaceChildren();
});

it("prefers the workspace conversation over a background widget and returns ownership on teardown", () => {
    const widget = Symbol("widget");
    const conversation = Symbol("conversation");
    const releaseWidget = registerKrontermSidebarOwner(widget);
    const releaseConversation = registerKrontermSidebarOwner(conversation, true);
    expect($krontermSidebarOwner.get()).toBe(conversation);
    releaseConversation();
    expect($krontermSidebarOwner.get()).toBe(widget);
    releaseWidget();
    expect($krontermSidebarOwner.get()).toBeNull();
});

it("keeps one sidebar owner and preserves its draft while the rail is hidden", async () => {
    const host = document.createElement("div");
    const target = document.createElement("aside");
    document.body.append(host, target);
    const root = createRoot(host);
    function Draft() {
        const [value, setValue] = useState("saved search");
        return <input value={value} onChange={(event) => setValue(event.target.value)} />;
    }
    try {
        await act(async () => {
            $krontermSidebarTarget.set(target);
            root.render(
                <>
                    <KrontermSidebar>
                        <Draft />
                    </KrontermSidebar>
                    <KrontermSidebar>
                        <Draft />
                    </KrontermSidebar>
                </>
            );
        });
        expect(target.querySelectorAll("input")).toHaveLength(1);
        const input = target.querySelector("input");
        target.hidden = true;
        target.hidden = false;
        expect(target.querySelector("input")).toBe(input);
        expect(input.value).toBe("saved search");
        await act(async () => target.querySelector<HTMLButtonElement>("#kronterm-navigation-workflows").click());
        expect(target.querySelector("#kronterm-navigation-pane-sessions").hasAttribute("hidden")).toBe(true);
        expect(target.querySelector("input")).toBe(input);
        await act(async () => target.querySelector<HTMLButtonElement>("#kronterm-navigation-sessions").click());
        expect(target.querySelector("input").value).toBe("saved search");
        await act(async () => root.unmount());
        expect($krontermSidebarOwner.get()).toBeNull();
        expect(target.childElementCount).toBe(0);
    } finally {
        await act(async () => root.unmount());
    }
});
