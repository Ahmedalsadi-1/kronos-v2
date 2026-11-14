import { expect, it, vi } from "vitest";
import { createAgentPreviewPublisher } from "./agent-native-preview";

const activity = {
    source: "hermes",
    phase: "succeeded",
    surface: "desktop",
    action: "click",
    sessionid: "child",
    surfaceid: "desktop:Safari",
    appname: "Safari",
} as const;

it("captures the named app without blocking tool activity", async () => {
    const publish = vi.fn();
    const capture = vi.fn(async () => "data:image/png;base64,app");
    const emit = createAgentPreviewPublisher(publish, capture);
    emit(activity);
    expect(publish).toHaveBeenCalledExactlyOnceWith(activity);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(capture).toHaveBeenCalledExactlyOnceWith("Safari");
    expect(publish.mock.lastCall[0].previewimageurl).toContain(",app");
});

it("discards a late native capture when the child switches tools", async () => {
    let finish: (image: string) => void;
    const publish = vi.fn();
    const capture = vi.fn(
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            })
    );
    const emit = createAgentPreviewPublisher(publish, capture);
    emit(activity);
    emit({ ...activity, surface: "file", surfaceid: undefined });
    finish("data:image/png;base64,stale");
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.every(([event]) => !event.previewimageurl)).toBe(true);
});

it("uses supplied screenshots without recapturing or selecting an unspecified app", () => {
    const capture = vi.fn();
    const emit = createAgentPreviewPublisher(vi.fn(), capture);
    emit({ ...activity, previewimageurl: "data:image/png;base64,provided" });
    emit({ ...activity, appname: undefined, surfaceid: "desktop" });
    expect(capture).not.toHaveBeenCalled();
});

it("reports a missing window as preview feedback without failing the tool", async () => {
    const publish = vi.fn();
    const emit = createAgentPreviewPublisher(publish, async () => {
        throw new Error("App preview unavailable");
    });
    expect(() => emit(activity)).not.toThrow();
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.lastCall[0]).toMatchObject({ phase: "succeeded", previewerror: "App preview unavailable" });
});

it("coalesces rapid native actions into a final snapshot", async () => {
    vi.useFakeTimers();
    try {
        let finish: (image: string) => void;
        const capture = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<string>((resolve) => {
                        finish = resolve;
                    })
            )
            .mockResolvedValue("data:image/png;base64,latest");
        const publish = vi.fn();
        const emit = createAgentPreviewPublisher(publish, capture);
        emit(activity);
        emit({ ...activity, detail: "Second click" });
        emit({ ...activity, detail: "Final click" });
        finish("data:image/png;base64,old");
        await vi.advanceTimersByTimeAsync(1000);
        expect(capture).toHaveBeenCalledTimes(2);
        expect(publish.mock.lastCall[0]).toMatchObject({
            detail: "Final click",
            previewimageurl: "data:image/png;base64,latest",
        });
        await vi.runAllTimersAsync();
    } finally {
        vi.useRealTimers();
    }
});
