import { beforeEach, expect, it, vi } from "vitest";
import { $hubActions, $hubInstalledOverride, installHubSkill } from "./hub-actions";
const mocks = vi.hoisted(() => ({
    status: vi.fn(),
    install: vi.fn(),
    reload: vi.fn(),
    invalidate: vi.fn(),
    slash: vi.fn(),
}));
vi.mock("@hermes/hermes", () => ({
    getActionStatus: mocks.status,
    installSkillFromHub: mocks.install,
    uninstallSkillFromHub: mocks.install,
    updateSkillsFromHub: mocks.install,
}));
vi.mock("@hermes/lib/query-client", () => ({ queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@hermes/lib/slash-completion-cache", () => ({ invalidateSlashCompletions: mocks.slash }));
vi.mock("@hermes/store/activity", () => ({ upsertDesktopActionTask: vi.fn() }));
vi.mock("@hermes/store/profile", () => ({
    $activeGatewayProfile: { subscribe: (fn: any) => fn("default") },
    normalizeProfileKey: (s: string) => s || "default",
}));
vi.mock("@hermes/store/reload-installed-skills", () => ({ reloadInstalledSkills: mocks.reload }));
beforeEach(() => {
    vi.clearAllMocks();
    $hubActions.set({});
    $hubInstalledOverride.set({});
    mocks.install.mockResolvedValue({ name: "install" });
    mocks.status.mockResolvedValue({ running: false, exit_code: 0, lines: ["Installed"] });
    mocks.reload.mockResolvedValue(undefined);
});
it("reloads only after a successful install and refreshes discovery", async () => {
    await installHubSkill("test-skill", "default");
    expect(mocks.reload).toHaveBeenCalledWith("default");
    expect($hubActions.get()["test-skill"].lines.at(-1)).toBe("Skills reloaded. Ready to use.");
    expect(mocks.slash).toHaveBeenCalledTimes(1);
});
it("rejects failed installers without hot reload or claiming installation", async () => {
    mocks.status.mockResolvedValue({ running: false, exit_code: 1, lines: ["Failed"] });
    await expect(installHubSkill("test-skill")).rejects.toThrow("failed");
    expect(mocks.reload).not.toHaveBeenCalled();
    expect($hubInstalledOverride.get()["test-skill"]).toBeUndefined();
});
it("preserves installed status and refreshes lists when hot reload fails", async () => {
    mocks.reload.mockRejectedValue(new Error("offline"));
    await expect(installHubSkill("test-skill")).rejects.toThrow("hot reload did not complete");
    expect($hubInstalledOverride.get()["test-skill"]).toBe(true);
    expect(mocks.slash).toHaveBeenCalledTimes(1);
    expect($hubActions.get()["test-skill"].running).toBe(false);
});
it("keeps the installer busy until hot reload finishes", async () => {
    let finish: () => void;
    mocks.reload.mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            })
    );
    const action = installHubSkill("test-skill");
    await vi.waitFor(() => expect(mocks.reload).toHaveBeenCalled());
    expect($hubActions.get()["test-skill"].running).toBe(true);
    finish();
    await action;
    expect($hubActions.get()["test-skill"].running).toBe(false);
});
