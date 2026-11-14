// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { makePenFrameClient, registerPenEditor, requestPenEditor } from "./os-pen-editor-bridge";

afterEach(() => vi.useRealTimers());

it("waits for the correct workspace editor and rejects unsupported operations", async () => {
    const request = vi.fn().mockResolvedValue({ selection: [] });
    const result = requestPenEditor("design-a", "get_app_state");
    const removeOther = registerPenEditor("design-b", vi.fn());
    const remove = registerPenEditor("design-a", request);
    await expect(result).resolves.toEqual({ selection: [] });
    expect(request).toHaveBeenCalledWith("get_app_state", {});
    await expect(requestPenEditor("design-a", "shell" as never)).rejects.toThrow("Unsupported");
    remove();
    removeOther();
});

it("accepts only responses from its own frame and origin", async () => {
    const frame = { postMessage: vi.fn() } as unknown as Window;
    const client = makePenFrameClient(frame, "http://localhost:9124");
    const result = client.request("read_skill", { name: "execute" });
    const sent = vi.mocked(frame.postMessage).mock.calls[0][0];
    const data = { source: "kronos-pen", id: sent.id, result: "skill contents" };
    expect(client.receive(new MessageEvent("message", { data, source: window, origin: "http://localhost:9124" }))).toBe(
        false
    );
    expect(
        client.receive(new MessageEvent("message", { data, source: frame, origin: "https://untrusted.example" }))
    ).toBe(false);
    expect(client.receive(new MessageEvent("message", { data, source: frame, origin: "http://localhost:9124" }))).toBe(
        true
    );
    await expect(result).resolves.toBe("skill contents");
    client.dispose();
});

it("rejects queued requests on close and preserves editor errors", async () => {
    const frame = { postMessage: vi.fn() } as unknown as Window;
    const client = makePenFrameClient(frame, "http://localhost");
    const failed = client.request("execute", { code: "bad script" });
    const { id } = vi.mocked(frame.postMessage).mock.calls[0][0];
    client.receive(
        new MessageEvent("message", {
            source: frame,
            origin: "http://localhost",
            data: { source: "kronos-pen", id, error: "Unknown layer" },
        })
    );
    await expect(failed).rejects.toThrow("Unknown layer");
    const waiting = client.request("save");
    client.dispose();
    await expect(waiting).rejects.toThrow("closed");
});

it("expires unavailable workspace editors instead of routing to a different tab", async () => {
    vi.useFakeTimers();
    const result = requestPenEditor("never-mounted", "get_app_state");
    const assertion = expect(result).rejects.toThrow("not ready");
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
});
