import { beforeEach, expect, it, vi } from "vitest";
import { reloadInstalledSkills } from "./reload-installed-skills";
const state = vi.hoisted(() => ({ profile: "default", request: vi.fn(), connected: true }));
vi.mock("@hermes/store/gateway", () => ({
    $gateway: { get: () => (state.connected ? { request: state.request } : null) },
}));
vi.mock("@hermes/store/profile", () => ({
    $activeGatewayProfile: { get: () => state.profile },
    normalizeProfileKey: (value: string) => value || "default",
}));
beforeEach(() => {
    state.profile = "default";
    state.connected = true;
    state.request.mockReset().mockResolvedValue({});
});
it("reloads through the current gateway without restarting the window", async () => {
    await reloadInstalledSkills();
    expect(state.request).toHaveBeenCalledWith("skills.reload", {});
});
it("never reloads the wrong profile", async () => {
    await expect(reloadInstalledSkills("other")).rejects.toThrow("Switch to that profile");
    expect(state.request).not.toHaveBeenCalled();
});
it("reports a disconnected agent and runtime failures", async () => {
    state.connected = false;
    await expect(reloadInstalledSkills()).rejects.toThrow("disconnected");
    state.connected = true;
    state.request.mockRejectedValue(new Error("Reload unavailable"));
    await expect(reloadInstalledSkills()).rejects.toThrow("Reload unavailable");
});
