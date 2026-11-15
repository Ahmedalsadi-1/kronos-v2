import { expect, it, vi } from "vitest";
import { makePenCameraSync, readPenCameraSnapshot } from "./os-pen-camera";

const Viewport = { x: 240, y: 0, width: 800, height: 600 };
const Initial = { x: 20, y: 30, zoom: 1 };
const snapshot = (camera = Initial) => ({ camera, viewport: Viewport });
const settle = async () => {
    for (let index = 0; index < 5; index++) await Promise.resolve();
};

it("restores the OS camera before accepting Pen's initial fit", async () => {
    let resolve: (value: unknown) => void;
    const apply = vi.fn(
        () =>
            new Promise((done) => {
                resolve = done;
            })
    );
    const onCamera = vi.fn();
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera, onViewport: vi.fn(), onError: vi.fn() });
    sync.start();
    sync.receive(snapshot({ x: 400, y: 500, zoom: 0.5 }));
    expect(onCamera).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledExactlyOnceWith(Initial);
    resolve(snapshot());
    await settle();
    expect(onCamera).toHaveBeenLastCalledWith(Initial);
});

it("does not echo native gestures or pixel-snapped camera responses", async () => {
    const apply = vi.fn().mockResolvedValue(snapshot());
    const onCamera = vi.fn();
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera, onViewport: vi.fn(), onError: vi.fn() });
    sync.start();
    await settle();
    const gesture = { x: 92, y: -81, zoom: 0.75 };
    sync.receive(snapshot(gesture));
    sync.setCamera(gesture);
    await settle();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onCamera).toHaveBeenLastCalledWith(gesture);
    apply.mockResolvedValue(snapshot({ ...gesture, x: 100 }));
    sync.setCamera({ ...gesture, x: 100.2 });
    await settle();
    sync.setCamera({ ...gesture, x: 100 });
    expect(apply).toHaveBeenCalledTimes(2);
});

it("coalesces outgoing movement and ignores stale acknowledgements", async () => {
    const completions: Array<(value: unknown) => void> = [];
    const apply = vi.fn(() => new Promise((resolve) => completions.push(resolve)));
    const onCamera = vi.fn();
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera, onViewport: vi.fn(), onError: vi.fn() });
    sync.start();
    sync.setCamera({ ...Initial, x: 100 });
    sync.setCamera({ ...Initial, x: 200 });
    completions.shift()(snapshot());
    await settle();
    expect(onCamera).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith({ ...Initial, x: 200 });
    completions.shift()(snapshot({ ...Initial, x: 200 }));
    await settle();
    expect(onCamera).toHaveBeenLastCalledWith({ ...Initial, x: 200 });
});

it("does not move a hidden canvas and discards responses after disposal", async () => {
    const onCamera = vi.fn();
    const apply = vi.fn().mockResolvedValue(snapshot());
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera, onViewport: vi.fn(), onError: vi.fn() });
    sync.setCamera({ ...Initial, x: 70 });
    expect(apply).not.toHaveBeenCalled();
    sync.start();
    sync.dispose();
    await settle();
    expect(onCamera).not.toHaveBeenCalled();
});

it("keeps the latest host move when an older native event arrives during a write", async () => {
    const replies: Array<(value: unknown) => void> = [];
    const apply = vi.fn(() => new Promise((resolve) => replies.push(resolve)));
    const onCamera = vi.fn();
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera, onViewport: vi.fn(), onError: vi.fn() });
    const at = (x: number, sequence: number) => ({ ...snapshot({ ...Initial, x }), sequence });
    sync.start();
    replies.shift()(at(Initial.x, 1));
    await settle();
    sync.setCamera(at(100, 0).camera);
    sync.setCamera(at(200, 0).camera);
    sync.receive(at(40, 2));
    replies.shift()(at(100, 3));
    await settle();
    expect(apply).toHaveBeenLastCalledWith(at(200, 0).camera);
    replies.shift()(at(200, 4));
    await settle();
    sync.receive(at(100, 3));
    expect(onCamera).toHaveBeenLastCalledWith(at(200, 0).camera);

    sync.setCamera(at(300, 0).camera);
    sync.receive(at(310, 6));
    replies.shift()(at(300, 5));
    await settle();
    expect(onCamera).toHaveBeenLastCalledWith(at(310, 0).camera);
});

it("rejects invalid camera geometry and reports apply failures once", async () => {
    expect(readPenCameraSnapshot(snapshot({ ...Initial, zoom: 0 }))).toBeUndefined();
    expect(readPenCameraSnapshot({ camera: Initial, viewport: { ...Viewport, width: NaN } })).toBeUndefined();
    expect(readPenCameraSnapshot({ camera: Initial, viewport: { ...Viewport, width: 0 } })).toBeUndefined();
    const apply = vi.fn().mockRejectedValue(new Error("Lost canvas"));
    const onError = vi.fn();
    const sync = makePenCameraSync({ camera: Initial, apply, onCamera: vi.fn(), onViewport: vi.fn(), onError });
    sync.start();
    await settle();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
});
