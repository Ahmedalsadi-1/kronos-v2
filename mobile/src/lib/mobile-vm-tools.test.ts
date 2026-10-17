import { beforeEach, expect, it, vi } from "vitest";
import { dispatchMobileVMTool } from "./mobile-vm-tools";
const mocks = vi.hoisted(() => ({
    vm: { waitUntilReady: vi.fn(), readFile: vi.fn(), writeFiles: vi.fn(), save: vi.fn() },
    exec: vi.fn(),
}));
vi.mock("./local-linux", () => ({ localLinux: mocks.vm }));
vi.mock("./agent-linux-sandbox", () => ({ runSandboxCode: mocks.exec }));
beforeEach(() => vi.resetAllMocks());
it("routes default command execution to the persistent phone VM", async () => {
    mocks.exec.mockResolvedValue({ exitCode: 0, output: "actual", artifacts: [] });
    await dispatchMobileVMTool("vm_exec", { script: "pwd" });
    expect(mocks.exec.mock.calls[0][1]).toBe(mocks.vm);
    expect(mocks.vm.save).toHaveBeenCalled();
});
it("uses a disposable guest only when explicitly requested", async () => {
    mocks.exec.mockResolvedValue({ exitCode: 0, output: "", artifacts: [] });
    await dispatchMobileVMTool("vm_exec", { script: "pwd", isolated: true });
    expect(mocks.exec.mock.calls[0][1]).toBeUndefined();
    expect(mocks.vm.save).not.toHaveBeenCalled();
});
it("rejects malformed and escaped file paths before touching the runtime", async () => {
    await expect(dispatchMobileVMTool("vm_write_file", { path: "../secret", content: "x" })).rejects.toThrow();
    await expect(dispatchMobileVMTool("unknown", {})).rejects.toThrow();
    expect(mocks.vm.waitUntilReady).not.toHaveBeenCalled();
});
