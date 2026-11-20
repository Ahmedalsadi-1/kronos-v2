import { expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { sendEmulatorGestureSequence } from "./emulator-gesture-sender";

it("flushes ordered touch events and rejects a disconnected gesture without hanging", async () => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `ws://127.0.0.1:${(server.address() as any).port}`;
    const received: any[] = [];
    server.on("connection", (socket) =>
        socket.on("message", (raw) => {
            received.push(JSON.parse((raw as Buffer).subarray(1).toString()));
            if (received.length === 3) socket.terminate();
        })
    );
    try {
        const points = [
            { type: "begin", x: 0.2, y: 0.3 },
            { type: "end", x: 0.2, y: 0.3 },
        ] as const;
        await sendEmulatorGestureSequence(url, [...points]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(received).toEqual(points);
        await expect(sendEmulatorGestureSequence(url, [...points])).rejects.toThrow("closed");
    } finally {
        for (const socket of server.clients) socket.terminate();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
