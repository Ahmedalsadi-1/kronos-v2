// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ManagedComputerWidget } from "./managed-computer-widget";

const fixture = vi.hoisted(() => ({ props: null as any, api: null as any }));
vi.mock("@/store/global", () => ({ getApi: () => fixture.api }));
vi.mock("@hermes/computer/computer-widget", () => ({ ComputerWidget: () => null }));
vi.mock("./managed-vnc-screen", () => ({
    ManagedVncScreen: (props) => {
        fixture.props = props;
        return <div />;
    },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("returns to the original agent assignment without binding the VM to the focused workspace", async () => {
    const desktop = {
        id: "linux-vm:ubuntu",
        controlOwner: "user",
        assignedAgentId: "sandbox:original-workspace",
        controlGeneration: 8,
    };
    fixture.api = {
        listLinuxDesktops: vi.fn(async () => ({ success: true, data: [desktop] })),
        resumeLinuxDesktop: vi.fn(async () => ({
            success: true,
            data: { ...desktop, controlOwner: "agent", controlGeneration: 9 },
        })),
        sandboxComputerAccess: vi.fn(),
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<ManagedComputerWidget />));
        await act(async () => fixture.props.onReturnControl());
        expect(fixture.api.resumeLinuxDesktop).toHaveBeenCalledWith("linux-vm:ubuntu", 8);
        expect(fixture.api.sandboxComputerAccess).not.toHaveBeenCalled();
        expect(fixture.props.desktop.controlOwner).toBe("agent");
    } finally {
        await act(async () => root.unmount());
    }
});
