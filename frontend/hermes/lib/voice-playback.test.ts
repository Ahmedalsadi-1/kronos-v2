// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { $voicePlayback } from "@hermes/store/voice-playback";
import { startSpeechStream, stopVoicePlayback } from "./voice-playback";

function mockAudio() {
    const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as () => void };
    vi.stubGlobal("AudioContext", class {
        currentTime = 0;
        destination = {};
        state = "running";
        resume = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
        createBufferSource = () => source;
        decodeAudioData = vi.fn().mockResolvedValue({
            duration: 0.1, sampleRate: 24000, getChannelData: () => new Float32Array(2400),
        });
    });
    return source;
}

afterEach(() => {
    stopVoicePlayback();
    vi.unstubAllGlobals();
});

it("speaks a complete phrase while the rest of the agent reply is still streaming", async () => {
    const source = mockAudio();
    const synthesize = vi.fn().mockResolvedValue(new ArrayBuffer(2));
    const stream = await startSpeechStream({ source: "voice-conversation", synthesize });
    stream.append("Hel");
    expect(synthesize).not.toHaveBeenCalled();
    stream.append("lo.");
    await vi.waitFor(() => expect(source.start).toHaveBeenCalledOnce());
    expect(synthesize).toHaveBeenCalledWith("Hello.");
    expect($voicePlayback.get().status).toBe("speaking");
    stream.finish();
    source.onended();
    await expect(stream.done).resolves.toBe("done");
});

it("does not play a local clip returned after an interruption", async () => {
    const source = mockAudio();
    let finishSynthesis: (value: ArrayBuffer) => void;
    const synthesize = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { finishSynthesis = resolve; }));
    const stream = await startSpeechStream({ source: "voice-conversation", synthesize });
    stream.append("Hello. ");
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledOnce());
    stopVoicePlayback();
    finishSynthesis(new ArrayBuffer(2));
    await expect(stream.done).resolves.toBe("done");
    expect(source.start).not.toHaveBeenCalled();
});

it("falls back when Tiny Voca is unavailable before any speech starts", async () => {
    mockAudio();
    const synthesize = vi.fn().mockRejectedValue(new Error("Service unavailable"));
    const stream = await startSpeechStream({ source: "voice-conversation", synthesize });
    stream.append("Hello.");
    stream.finish();
    await expect(stream.done).resolves.toBe("fallback");
});
