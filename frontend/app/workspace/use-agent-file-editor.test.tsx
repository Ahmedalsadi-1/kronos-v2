// @vitest-environment jsdom
import { publishAgentActivity } from "@/types/agent-activity";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentFileEditor } from "./use-agent-file-editor";

const mocks = vi.hoisted(() => ({
    models: [] as any[],
    create: vi.fn(async () => "editor"),
    island: vi.fn(async () => "island"),
    hud: false,
}));
vi.mock("@/app/store/global", () => ({
    getAllBlockComponentModels: () => mocks.models,
    createBlock: mocks.create,
    getApi: () => ({ setDesktopPetActivity: vi.fn() }),
}));
vi.mock("./kronterm-hud-controller", () => ({ kronTermHudController: { getSnapshot: () => ({ active: mocks.hud }) } }));
vi.mock("./kronterm-hud-islands", () => ({ launchKronTermHudIsland: mocks.island }));

afterEach(() => {
    vi.clearAllMocks();
    mocks.models = [];
    mocks.hud = false;
});
function Host() {
    useAgentFileEditor();
    return null;
}

it.each([false, true])("opens a live file editor once per run (HUD: %s)", async (hud) => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.hud = hud;
    const root = createRoot(document.createElement("div"));
    const event = {
        source: "hermes" as const,
        surface: "file" as const,
        action: "type" as const,
        phase: "running" as const,
        filepath: "/project/local.ts",
        runid: "open-editor-test",
    };
    try {
        await act(async () => root.render(<Host />));
        await act(async () => publishAgentActivity(event));
        await act(async () => publishAgentActivity({ ...event, phase: "succeeded" }));
        if (hud) {
            expect(mocks.island).toHaveBeenCalledExactlyOnceWith("files", { file: "/project/local.ts" });
            expect(mocks.create).not.toHaveBeenCalled();
        } else {
            expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
                meta: { view: "preview", file: "/project/local.ts", edit: true },
            });
            expect(mocks.island).not.toHaveBeenCalled();
        }
    } finally {
        await act(async () => root.unmount());
    }
});
