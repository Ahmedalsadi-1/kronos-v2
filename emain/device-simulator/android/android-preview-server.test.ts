import { once } from "node:events";
import { expect, test, vi } from "vitest";
import { startAndroidPreviewServer } from "./android-preview-server";

test("preview pins Android input to a listed device and rejects cross-origin or unauthenticated input", async () => {
    const target = { id: "android-avd:pixel", kind: "android-emulator", controlGeneration: 3, status: "booted" };
    const runtime = { list: async () => [target], perform: vi.fn(async () => ({ target })) };
    const preview = startAndroidPreviewServer(runtime as any, 0);
    try {
        await once(preview.server, "listening");
        const base = `http://127.0.0.1:${(preview.server.address() as any).port}`;
        const html = await (await fetch(base)).text();
        const token = /const token="([a-f0-9]+)"/.exec(html)[1];
        const url = `${base}/action?token=${token}&target=${target.id}`;
        const body = JSON.stringify({ action: "tap", targetId: "other", expectedGeneration: 3, x: 0.3, y: 0.4 });
        expect(
            (
                await fetch(url, {
                    method: "POST",
                    headers: { "content-type": "application/json", origin: "https://example.com" },
                    body,
                })
            ).status
        ).toBe(403);
        expect((await fetch(`${base}/devices`)).status).toBe(403);
        expect(runtime.perform).not.toHaveBeenCalled();
        expect(
            (await fetch(url, { method: "POST", headers: { "content-type": "application/json", origin: base }, body }))
                .status
        ).toBe(200);
        expect(runtime.perform).toHaveBeenCalledWith({
            action: "tap",
            targetId: target.id,
            expectedGeneration: 3,
            x: 0.3,
            y: 0.4,
        });
    } finally {
        preview.close();
    }
});
