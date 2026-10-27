// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { modelOptionsQueryKey, requestModelOptions } from "./model-options";

const rest = vi.hoisted(() => vi.fn());
vi.mock("@hermes/hermes", () => ({ getGlobalModelOptions: rest }));

afterEach(() => {
    delete window.hermesDesktop;
    vi.clearAllMocks();
});

it("separates draft engine catalogs while preserving live chat cache identity", () => {
    let active = "hermes";
    window.hermesDesktop = { agentBackends: { getActive: () => active } } as any;
    const hermes = modelOptionsQueryKey("default");
    const session = modelOptionsQueryKey("default", "kronoscode:chat");
    active = "opencode";
    expect(modelOptionsQueryKey("default")).not.toEqual(hermes);
    expect(modelOptionsQueryKey("default", "kronoscode:chat")).toEqual(session);
});

it("returns the selected engine catalog even when empty, without substituting Hermes models", async () => {
    const options = { provider: "opencode", model: "", providers: [] };
    const route = vi.fn().mockResolvedValue(options);
    window.hermesDesktop = { agentBackends: { route } } as any;
    expect(await requestModelOptions({ refresh: true })).toEqual(options);
    expect(route).toHaveBeenCalledWith("model.options", { refresh: true });
    expect(rest).not.toHaveBeenCalled();
});

it("preserves engine discovery errors and forwards live session identity", async () => {
    const route = vi.fn().mockRejectedValue(new Error("OpenCode is unavailable"));
    window.hermesDesktop = { agentBackends: { route } } as any;
    await expect(requestModelOptions({ sessionId: "kronoscode:chat" })).rejects.toThrow("OpenCode is unavailable");
    expect(route).toHaveBeenCalledWith("model.options", { session_id: "kronoscode:chat" });
    expect(rest).not.toHaveBeenCalled();
});
