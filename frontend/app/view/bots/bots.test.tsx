// @vitest-environment jsdom
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { focusBotConversation } from "@/app/view/hermes/openmausbot-hermes-backend";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotsWidget } from "./bots";
const api = vi.hoisted(() => ({
    openAgentWorkspace: vi.fn(),
    openBotDesktop: vi.fn(),
    switchWorkspace: vi.fn(),
    agentBotCommand: vi.fn(),
}));
vi.mock("@/store/global", () => ({ getApi: () => api }));
vi.mock("@/app/view/hermes/openmausbot-hermes-backend", () => ({
    botSessionId: (botId: string, threadId: string) => `openmausbot:${botId}:${threadId}`,
    focusBotConversation: vi.fn(),
}));
vi.mock("@/app/view/hermes/hermes-surface-controller", () => ({
    hermesSurfaceController: { requestOpenPanel: vi.fn(), requestOpenHud: vi.fn(), setSession: vi.fn() },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    api.agentBotCommand.mockResolvedValue({ bots: [] });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});
const connection = { origin: "http://127.0.0.1:9012", parentOrigin: "http://localhost" };
async function mount() {
    api.openAgentWorkspace.mockResolvedValue(connection);
    await act(async () => {
        root.render(<BotsWidget />);
    });
    return container.querySelector("iframe");
}
function message(frame: HTMLIFrameElement, origin = connection.origin, source: Window = frame.contentWindow) {
    window.dispatchEvent(
        new MessageEvent("message", {
            origin,
            source,
            data: { source: "kronterm-openmausbot", type: "open-desktop", botId: "bot-one" },
        })
    );
}
describe("Bots widget desktop handoff", () => {
    it("opens a bot's existing desktop directly from its conversation row", async () => {
        api.agentBotCommand.mockResolvedValue({ bots: [{ id: "bot-one", name: "Builder", tasks: [] }] });
        api.openBotDesktop.mockResolvedValue({ workspaceId: "existing-workspace" });
        await mount();
        const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Open desktop");
        await act(async () => button.click());
        expect(api.openBotDesktop).toHaveBeenCalledWith("bot-one");
        expect(api.switchWorkspace).toHaveBeenCalledWith("existing-workspace");
    });
    it("focuses the same bot conversation before opening the HUD", async () => {
        api.agentBotCommand.mockResolvedValue({
            bots: [{ id: "bot-one", name: "Builder", threadId: "thread-one", tasks: [] }],
        });
        await mount();
        const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "HUD");
        await act(async () => button.click());
        expect(hermesSurfaceController.requestOpenHud).toHaveBeenCalledWith("openmausbot:bot-one:thread-one");
        expect(focusBotConversation).toHaveBeenCalledWith("openmausbot:bot-one:thread-one");
        expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull();
    });
    it("opens the original bot thread in shared chat", async () => {
        api.agentBotCommand.mockResolvedValue({
            bots: [
                {
                    id: "bot-one",
                    name: "Builder",
                    threadId: "thread-one",
                    tasks: [{ threadId: "thread-one", title: "Build feature" }],
                },
            ],
        });
        await mount();
        const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Open chat");
        expect(button).toBeTruthy();
        await act(async () => {
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(hermesSurfaceController.requestOpenPanel).toHaveBeenCalledWith("openmausbot:bot-one:thread-one");
    });
    it("rejects messages from other origins and windows", async () => {
        const frame = await mount();
        expect(frame.src).toContain("/kronterm-app?parentOrigin=");
        await act(async () => {
            message(frame, "https://example.com");
            message(frame, connection.origin, window);
        });
        expect(api.openBotDesktop).not.toHaveBeenCalled();
    });
    it("hands a valid bot back to the existing desktop registry", async () => {
        api.openBotDesktop.mockResolvedValue({ workspaceId: "bot-workspace" });
        const frame = await mount();
        await act(async () => {
            message(frame);
        });
        expect(api.switchWorkspace).toHaveBeenCalledWith("bot-workspace");
        expect(api.openBotDesktop).toHaveBeenCalledWith("bot-one");
    });
    it("offers retry when the bot runtime fails to start", async () => {
        api.openAgentWorkspace.mockRejectedValueOnce(new Error("Runtime unavailable"));
        await act(async () => {
            root.render(<BotsWidget />);
        });
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        api.openAgentWorkspace.mockResolvedValue(connection);
        await act(async () => {
            container.querySelector("[role=alert] button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(container.querySelector("iframe")).not.toBeNull();
    });
});

it("opens bot conversations directly in the existing Hermes chat without starting the embedded bot app", async () => {
    api.agentBotCommand.mockResolvedValue({
        bots: [{ id: "builder", name: "Builder", threadId: "thread-one", tasks: [] }],
    });
    await act(async () => root.render(<BotsWidget withinHermes />));
    expect(api.openAgentWorkspace).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBeNull();
    const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Chat in Hermes");
    await act(async () => open.click());
    expect(focusBotConversation).toHaveBeenCalledWith("openmausbot:builder:thread-one");
    expect(hermesSurfaceController.setSession).toHaveBeenCalledWith("openmausbot:builder:thread-one");
    expect(hermesSurfaceController.requestOpenPanel).not.toHaveBeenCalled();
    expect(hermesSurfaceController.requestOpenHud).not.toHaveBeenCalled();
});
