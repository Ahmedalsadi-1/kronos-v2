import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { IosSimulatorControl, validateIosSimulatorEndpoint } from "./ios-simulator-control";

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
        const control = new IosSimulatorControl(
            async () => JSON.stringify({ ...Session, url: `http://127.0.0.1:${port}` }),
            async () => true
        );
        try {
            const frame = await control.frame(Udid);
            expect(frame.imageDataUrl).toBe(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
            expect(frame.capturedAt).toBeGreaterThan(0);
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
        expect(execute).toHaveBeenLastCalledWith(["tap", "0.2", "0.3", "-d", Udid]);
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
