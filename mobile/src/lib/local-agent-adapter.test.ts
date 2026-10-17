import { afterEach, expect, it, vi } from "vitest";
import { runLocalAgentTurn } from "./local-agent-adapter";
const dispatch = vi.hoisted(() => vi.fn());
vi.mock("./mobile-vm-tools", () => ({ dispatchMobileVMTool: dispatch, MobileVMTools: [] }));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});
it("dispatches a model tool call locally and feeds the real result into the next model request", async () => {
    dispatch.mockResolvedValue({ output: "guest-result", exitCode: 0 });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            tool_calls: [
                                { id: "t1", function: { name: "vm_exec", arguments: '{"script":"uname -a"}' } },
                            ],
                        },
                    },
                ],
            }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "Finished" } }] }) });
    vi.stubGlobal("fetch", fetch);
    expect(
        await runLocalAgentTurn(
            { endpoint: "https://model.example/v1/chat/completions", model: "test", apiKey: "test-only" },
            [{ role: "user", content: "Inspect Linux" }],
            new AbortController().signal
        )
    ).toBe("Finished");
    expect(dispatch).toHaveBeenCalledWith("vm_exec", { script: "uname -a" }, expect.any(AbortSignal));
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.messages.at(-1).content).toContain("guest-result");
    expect(body.messages.at(-1).content).not.toContain("test-only");
});
it("rejects insecure provider URLs before sending data", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
        runLocalAgentTurn(
            { endpoint: "http://model.example", model: "test", apiKey: "test" },
            [],
            new AbortController().signal
        )
    ).rejects.toThrow("HTTPS");
    expect(fetch).not.toHaveBeenCalled();
});
