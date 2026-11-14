import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
    bindSandboxChatComputer,
    bindSandboxComputer,
    computerTabForChats,
    holdComputerInteraction,
    hasSeparateChatComputer,
    initializeComputerAccessPersistence,
    registerComputerChats,
    rememberComputerControl,
    resolveComputerChatContext,
    restoredComputerControl,
    sandboxComputerForTab,
} from "./computer-access-policy";
import { QemuLinuxDesktopRuntime } from "./linux-desktop/qemu-linux-runtime";

const Roots: string[] = [];
afterEach(() => {
    initializeComputerAccessPersistence();
    Roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
    vi.useRealTimers();
});
it("restores the selected VM, chat owner and assignment after restart, but preserves a human handback", async () => {
    const root = mkdtempSync(join(tmpdir(), "computer-grants-"));
    Roots.push(root);
    const file = join(root, "access.json");
    initializeComputerAccessPersistence(file);
    bindSandboxComputer("owner", "linux-vm:ubuntu", "hybrid");
    registerComputerChats("owner", ["chat", "stored"], "workspace");
    const first = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
    vi.spyOn(first, "list").mockResolvedValue([]);
    await first.assign("linux-vm:ubuntu", "sandbox:owner", 0);
    initializeComputerAccessPersistence(file);
    const context = resolveComputerChatContext({ agentRuntime: "hermes", tabId: "unrelated" }, "chat");
    expect(context).toMatchObject({
        tabId: "owner",
        sandboxComputerId: "linux-vm:ubuntu",
        sandboxComputerMode: "hybrid",
    });
    const second = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
    expect((second as any).owner).toBe("agent");
    expect((second as any).generation).toBe(2);
    vi.spyOn(second, "list").mockResolvedValue([]);
    await second.takeover("linux-vm:ubuntu");
    initializeComputerAccessPersistence(file);
    const third = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
    expect((third as any).owner).toBe("user");
    expect((third as any).assignedAgentId).toBe("sandbox:owner");
    await expect(
        third.performAgent({
            desktopId: "linux-vm:ubuntu",
            action: "exec",
            command: "pwd",
            assignedAgentId: "sandbox:owner",
            expectedGeneration: 4,
        })
    ).rejects.toThrow("Control changed");
});

it("does not move a chat's live grant when another workspace renders or refreshes it", () => {
    bindSandboxComputer("owner", "linux-vm:ubuntu");
    registerComputerChats("owner", ["chat", "stored"]);
    for (let index = 0; index < 5; index++) registerComputerChats("other", ["chat", "stored"]);
    expect(computerTabForChats(["chat", "stored"], "other")).toBe("owner");
    expect(resolveComputerChatContext({ agentRuntime: "hermes", tabId: "other" }, "chat").sandboxComputerId).toBe(
        "linux-vm:ubuntu"
    );
    bindSandboxComputer("other", "linux-vm:ubuntu");
    registerComputerChats("other", ["chat", "stored"], undefined, true);
    expect(sandboxComputerForTab("owner")).toBeUndefined();
    expect(computerTabForChats(["chat"], "owner")).toBe("other");
});

it("restores a separate chat grant and routes new runtime aliases to that VM only for its chat", () => {
    const root = mkdtempSync(join(tmpdir(), "computer-grants-"));
    Roots.push(root);
    const file = join(root, "access.json");
    initializeComputerAccessPersistence(file);
    bindSandboxComputer("owner", "linux-vm:ubuntu");
    registerComputerChats("owner", ["original"]);
    registerComputerChats("owner", ["old-runtime", "stored"], "workspace");
    bindSandboxChatComputer("owner", "stored", "linux-vm:second", "hybrid");
    rememberComputerControl("linux-vm:second", { owner: "agent", agentId: "sandbox:owner", generation: 3 });

    initializeComputerAccessPersistence(file);
    registerComputerChats("owner", ["new-runtime", "stored"], "workspace");
    const caller = { agentRuntime: "hermes" as const };
    expect(resolveComputerChatContext(caller, "new-runtime")).toMatchObject({
        sandboxComputerId: "linux-vm:second",
        sandboxComputerMode: "hybrid",
    });
    expect(resolveComputerChatContext(caller, "original").sandboxComputerId).toBe("linux-vm:ubuntu");
    expect(() => resolveComputerChatContext(caller, "original", "new-runtime")).toThrow("different sandbox grants");
    expect(() => registerComputerChats("owner", ["new-runtime", "original"])).toThrow("conflict");
    expect(hasSeparateChatComputer("linux-vm:second", "owner", "original")).toBe(true);
    expect(hasSeparateChatComputer("linux-vm:second", "owner", "new-runtime")).toBe(false);
    expect(restoredComputerControl("linux-vm:second")).toMatchObject({ owner: "agent", generation: 4 });
});

it("keeps an active workspace's VM alive through thinking pauses and permits idle stop after handback", async () => {
    vi.useFakeTimers();
    bindSandboxComputer("owner", "linux-vm:ubuntu");
    const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
    vi.spyOn(runtime, "list").mockResolvedValue([]);
    const execute = vi.spyOn(runtime as any, "execute").mockResolvedValue({ desktop: {} });
    await runtime.assign("linux-vm:ubuntu", "sandbox:owner", 0);
    (runtime as any).scheduleIdle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(execute).not.toHaveBeenCalled();
    await runtime.takeover("linux-vm:ubuntu");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: "stop" }), false);
});
it("keeps a human sign-in wait alive only until its bounded interaction hold ends", async () => {
    vi.useFakeTimers();
    const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
    const execute = vi.spyOn(runtime as any, "execute").mockResolvedValue({ desktop: {} });
    holdComputerInteraction("linux-vm:ubuntu", Date.now() + 15 * 60_000);
    (runtime as any).scheduleIdle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(execute).not.toHaveBeenCalled();
    holdComputerInteraction("linux-vm:ubuntu");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: "stop" }), false);
});
