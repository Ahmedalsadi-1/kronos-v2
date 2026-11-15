import { expect, it, vi } from "vitest";
import { makePenWidgetSync, readPenWidgetSnapshot, type PenLiveWidget } from "./os-pen-widgets";

const Widget: PenLiveWidget = {
    blockId: "browser",
    title: "Browser",
    x: 20,
    y: 30,
    width: 640,
    height: 480,
    visible: true,
};
const snapshot = (widget = Widget) => {
    const { title: _title, ...geometry } = widget;
    return { widgets: [geometry], selectedBlockIds: [widget.blockId] };
};
const settle = async () => {
    for (let index = 0; index < 5; index++) await Promise.resolve();
};

it("lets canonical widgets win startup and does not echo native moves, deletion, or undo", async () => {
    let finish: (value: unknown) => void;
    const apply = vi.fn(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            })
    );
    const onWidgets = vi.fn();
    const onReady = vi.fn();
    const sync = makePenWidgetSync({ widgets: [Widget], apply, onWidgets, onReady, onError: vi.fn() });
    sync.start();
    sync.receive(snapshot({ ...Widget, x: 900 }));
    expect(onWidgets).not.toHaveBeenCalled();
    finish(snapshot());
    await settle();
    expect(onReady).toHaveBeenLastCalledWith(true);
    for (const widget of [{ ...Widget, x: 200 }, { ...Widget, visible: false }, Widget]) {
        sync.receive(snapshot(widget));
        sync.setWidgets([widget]);
    }
    await settle();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onWidgets).toHaveBeenLastCalledWith(snapshot());
    sync.dispose();
    expect(onReady).toHaveBeenLastCalledWith(false);
});

it("coalesces external changes and retains titles while native geometry changes", async () => {
    const completions: Array<(value: unknown) => void> = [];
    const apply = vi.fn(() => new Promise((resolve) => completions.push(resolve)));
    const onWidgets = vi.fn();
    const sync = makePenWidgetSync({ widgets: [Widget], apply, onWidgets, onReady: vi.fn(), onError: vi.fn() });
    sync.start();
    sync.setWidgets([{ ...Widget, x: 100 }]);
    sync.setWidgets([{ ...Widget, x: 300, title: "Docs" }]);
    completions.shift()(snapshot());
    await settle();
    expect(onWidgets).not.toHaveBeenCalled();
    expect(apply).toHaveBeenLastCalledWith([{ ...Widget, x: 300, title: "Docs" }]);
    completions.shift()(snapshot({ ...Widget, x: 300 }));
    await settle();
    sync.receive(snapshot({ ...Widget, x: 302 }));
    sync.setWidgets([{ ...Widget, x: 302, title: "Docs" }]);
    expect(apply).toHaveBeenCalledTimes(2);
    sync.setWidgets([{ ...Widget, x: 302, title: "Terminal" }]);
    expect(apply).toHaveBeenCalledTimes(3);
    sync.dispose();
    completions.shift()(snapshot());
    await settle();
});

it("filters unknown native references and rejects malformed snapshots", async () => {
    const apply = vi.fn().mockResolvedValue(snapshot());
    const onWidgets = vi.fn();
    const onError = vi.fn();
    const sync = makePenWidgetSync({ widgets: [Widget], apply, onWidgets, onReady: vi.fn(), onError });
    sync.start();
    await settle();
    sync.receive({ widgets: [{ ...Widget, blockId: "other" }], selectedBlockIds: ["other"] });
    expect(onWidgets).toHaveBeenLastCalledWith({ widgets: [], selectedBlockIds: [] });
    expect(readPenWidgetSnapshot(snapshot({ ...Widget, width: NaN }))).toBeUndefined();
    expect(readPenWidgetSnapshot({ widgets: [Widget, Widget], selectedBlockIds: [] })).toBeUndefined();
    expect(readPenWidgetSnapshot({ widgets: [Widget], selectedBlockIds: [2] })).toBeUndefined();
    apply.mockRejectedValue(new Error("Disconnected"));
    sync.setWidgets([{ ...Widget, title: "Changed" }]);
    await settle();
    expect(onError).toHaveBeenCalledOnce();
    sync.dispose();
});

it("does not reactivate widget passthrough from an acknowledgement after a canvas failure", async () => {
    let complete: (value: unknown) => void;
    const onReady = vi.fn();
    const onWidgets = vi.fn();
    const sync = makePenWidgetSync({
        widgets: [Widget],
        apply: () =>
            new Promise((resolve) => {
                complete = resolve;
            }),
        onWidgets,
        onReady,
        onError: vi.fn(),
    });
    sync.start();
    sync.pause();
    complete(snapshot());
    await settle();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(false);
    expect(onWidgets).not.toHaveBeenCalled();
    sync.dispose();
});
