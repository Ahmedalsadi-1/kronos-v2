import WebSocket from "ws";
import { encodeServeSimTouchFrame, type ServeSimTouchFrame } from "./emulator-touch-frame";

export type EmulatorGesturePoint = ServeSimTouchFrame;

export async function sendEmulatorGestureSequence(wsUrl: string, points: EmulatorGesturePoint[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let index = 0;
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            clearTimeout(timer);
            if (error) {
                ws.terminate();
                reject(error);
            } else {
                ws.close();
                resolve();
            }
        };
        const deadline = setTimeout(() => finish(new Error("Simulator gesture timed out")), 15000);
        const sendNext = () => {
            if (index >= points.length) return finish();
            const point = points[index++];
            ws.send(Buffer.from(encodeServeSimTouchFrame(point)), (error) => {
                if (settled) return;
                if (error) return finish(error);
                // Preserve gesture cadence, but do not add a fixed delay after the final flushed event.
                if (index === points.length) finish();
                else timer = setTimeout(sendNext, 16);
            });
        };
        ws.on("open", sendNext);
        ws.on("error", finish);
        ws.on("close", () => finish(new Error("Emulator gesture stream closed before delivery completed")));
    });
}
