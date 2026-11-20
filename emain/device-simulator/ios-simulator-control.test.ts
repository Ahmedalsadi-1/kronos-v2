import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { IosSimulatorControl, validateIosSimulatorEndpoint } from "./ios-simulator-control";

import { sendEmulatorGestureSequence } from "./orca-ios/emulator-gesture-sender";
vi.mock("./orca-ios/emulator-gesture-sender", () => ({ sendEmulatorGestureSequence: vi.fn(async () => {}) }));

const Udid = "00000000-0000-0000-0000-000000000001";
const Session = { device: Udid, wsUrl: "ws://127.0.0.1:9000", url: "http://127.0.0.1:9001" };

describe("Orca iOS simulator adaptation", () => {
    it("reads fragmented native MJPEG frames through the vendored Orca reader", async () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
        const server = createServer((_request, response) => {
            response.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=frame" });
            response.write(jpeg.subarray(0, 3));
            response.write(jpeg.subarray(3));
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = (server.address() as { port: number }).port;
        const ready = vi.fn(async () => true);
        const control = new IosSimulatorControl(
            async () => JSON.stringify({ ...Session, url: `http://127.0.0.1:${port}` }),
            ready
        );
        try {
            const frame = await control.frame(Udid);
            expect(frame.imageDataUrl).toBe(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
            expect(frame.capturedAt).toBeGreaterThan(0);
            await control.frame(Udid);
            await control.tap(Udid, 0.2, 0.3);
            expect(ready).toHaveBeenCalledTimes(1);
            const clock = vi.spyOn(Date, "now").mockReturnValue(frame.capturedAt + 2001);
            try {
                await control.attach(Udid);
                expect(ready).toHaveBeenCalledTimes(2);
            } finally {
                clock.mockRestore();
            }
        } finally {
            await control.dispose();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
    it("rejects remote, credentialed and wrong-protocol helper endpoints", () => {
        for (const url of ["http://example.com:9001", "http://user@localhost:9001", "https://localhost:9001"]) {
            expect(() => validateIosSimulatorEndpoint(url, "http:")).toThrow();
        }
    });

    it("coalesces attach and forwards normalized tap to the actual helper", async () => {
        const execute = vi.fn(async () => JSON.stringify(Session));
        const control = new IosSimulatorControl(execute, async () => true);
        const [first, second] = await Promise.all([control.attach(Udid), control.attach(Udid)]);
        expect(first).toEqual(second);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(first.streamUrl).toBe("http://127.0.0.1:9001/stream.mjpeg");
        await control.tap(Udid, 0.2, 0.3);
        expect(sendEmulatorGestureSequence).toHaveBeenLastCalledWith("ws://127.0.0.1:9000/", [
            { type: "begin", x: 0.2, y: 0.3 },
            { type: "end", x: 0.2, y: 0.3 },
        ]);
        expect(execute).toHaveBeenCalledTimes(1);
        await expect(control.tap(Udid, 2, 0.3)).rejects.toThrow();
    });

    it("kills failed startup and refuses another device's endpoints", async () => {
        const execute = vi.fn(async () => JSON.stringify({ ...Session, device: "wrong-device" }));
        const control = new IosSimulatorControl(execute, async () => true);
        await expect(control.attach(Udid)).rejects.toThrow("different simulator");
        expect(execute).toHaveBeenLastCalledWith(["--kill", "-q", Udid]);
    });

    it("detaches only tracked devices on disposal", async () => {
        const execute = vi.fn(async () => JSON.stringify(Session));
        const control = new IosSimulatorControl(execute, async () => true);
        await control.attach(Udid);
        await control.dispose();
        expect(execute).toHaveBeenLastCalledWith(["--kill", "-q", Udid]);
    });

    it("normalizes accessibility frames for direct agent input", async () => {
        const request = vi.fn(
            async () =>
                new Response(
                    JSON.stringify([
                        {
                            type: "Application",
                            AXLabel: "Home Screen",
                            frame: { x: 0, y: 0, width: 100, height: 200 },
                            children: [{ AXLabel: "Settings", frame: { x: 25, y: 50, width: 50, height: 50 } }],
                        },
                    ])
                )
        );
        const control = new IosSimulatorControl(
            async () => JSON.stringify(Session),
            async () => true,
            request as typeof fetch
        );
        const tree = await control.accessibility(Udid);
        expect(tree[0].children[0].frame).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.25 });
        expect(await control.pickElement(Udid, 0.5, 0.4)).toMatchObject({
            application: "Home Screen",
            name: "Settings",
        });
    });
});

it("requires a post-input frame instead of returning the pre-action image", async () => {
    const execute = vi.fn(async () => JSON.stringify(Session));
    const control = new IosSimulatorControl(execute, async () => true);
    await control.attach(Udid);
    const record = { stream: { stop: vi.fn() }, imageDataUrl: "before", capturedAt: Date.now() };
    (control as any).streams.set(Udid, record);
    await control.tap(Udid, 0.5, 0.5);
    expect(record.imageDataUrl).toBeUndefined();
    const pending = control.frame(Udid);
    setTimeout(() => {
        record.imageDataUrl = "after";
        record.capturedAt = Date.now();
    }, 40);
    expect((await pending).imageDataUrl).toBe("after");
    await control.dispose();
});
