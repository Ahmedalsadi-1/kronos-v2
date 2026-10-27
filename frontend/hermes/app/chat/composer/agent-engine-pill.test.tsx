// @vitest-environment jsdom
import * as modelOptions from "@hermes/lib/model-options";
import { $currentModel, $currentProvider, setCurrentModel, setCurrentProvider } from "@hermes/store/session";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentEnginePill } from "./agent-engine-pill";

const mocks = vi.hoisted(() => ({
    runtimeId: null as string,
    active: "codex",
    onEngineChange: undefined as (value: string) => void,
}));
vi.mock("@nanostores/react", () => ({ useStore: () => mocks.runtimeId }));
vi.mock("@hermes/app/chat/session-view", () => ({ useSessionView: () => ({ $runtimeId: {} }) }));
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ variant: _variant, ...props }: any) => <button {...props} />,
}));
vi.mock("@hermes/components/ui/tooltip", () => ({ Tip: ({ children }: any) => children }));
vi.mock("@hermes/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: any) => children,
    DropdownMenuTrigger: ({ children }: any) => children,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
    DropdownMenuRadioGroup: ({ children, onValueChange }: any) => {
        mocks.onEngineChange = onValueChange;
        return children;
    },
    DropdownMenuRadioItem: ({ children, value, disabled }: any) => (
        <button data-engine={value} disabled={disabled}>
            {children}
        </button>
    ),
}));

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => {
    if (root) await act(() => root.unmount());
    container?.remove();
    mocks.runtimeId = null;
    mocks.active = "codex";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function mount() {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.hermesDesktop = {
        agentBackends: {
            getActive: () => mocks.active,
            setActive: (value: string) => {
                mocks.active = value;
            },
            getSessionBackend: () => "codex",
            onActiveChange: () => () => {},
            list: async () => [
                { id: "codex", label: "Codex", description: "ACP agent", available: true, logo: "/codex.svg" },
                { id: "claude", label: "Claude Code", description: "ACP agent", available: false, logo: "/claude.png" },
                { id: "my-agent", label: "My Agent", description: "ACP agent", available: true },
            ],
        },
    } as any;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<AgentEnginePill compact disabled={false} />));
}

describe("agent engine pill", () => {
    it("replaces the draft model with the selected engine's current model", async () => {
        await mount();
        vi.spyOn(modelOptions, "requestModelOptions").mockResolvedValue({
            model: "engine-model",
            provider: "opencode",
            providers: [],
        });
        await act(async () => mocks.onEngineChange("opencode"));
        expect($currentModel.get()).toBe("engine-model");
        expect($currentProvider.get()).toBe("opencode");
    });

    it("restores the prior engine and model when discovery fails", async () => {
        await mount();
        setCurrentModel("previous-model");
        setCurrentProvider("previous-provider");
        vi.spyOn(modelOptions, "requestModelOptions").mockRejectedValue(new Error("Agent unavailable"));
        await act(async () => mocks.onEngineChange("opencode"));
        expect(mocks.active).toBe("codex");
        expect($currentModel.get()).toBe("previous-model");
        expect($currentProvider.get()).toBe("previous-provider");
    });
    it("shows logos in the compact pill and detected choices, with unavailable agents disabled", async () => {
        await mount();
        const trigger = container.querySelector('[aria-label="Agent: Codex"]');
        expect(trigger.querySelector("img").getAttribute("src")).toBe("/codex.svg");
        expect(trigger.textContent).not.toContain("KC");
        expect(container.querySelector<HTMLButtonElement>('[data-engine="claude"]').disabled).toBe(true);
        expect(container.querySelector('[data-engine="claude"] img').getAttribute("src")).toBe("/claude.png");
        expect(container.querySelector('[data-engine="my-agent"]').textContent).toContain("My Agent");
    });

    it("shows the chat's actual ACP agent when the new-chat default is different", async () => {
        mocks.runtimeId = "kronoscode:session";
        mocks.active = "my-agent";
        await mount();
        expect(container.querySelector('[aria-label="Agent: Codex"]')).not.toBeNull();
        expect(container.textContent).toContain("This chat stays with Codex.");
    });
});
