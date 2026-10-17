import { describe, expect, it } from "vitest";
import { $voiceHud, publishVoiceHud, resetVoiceHud, type VoiceHudState } from "./voice-hud";

const state = (owner: string): VoiceHudState => ({
    owner,
    active: true,
    status: "listening",
    transcript: "",
    response: "",
    muted: false,
    level: 0,
    error: null,
});

describe("voice HUD ownership", () => {
    it("ignores unmount and inactive updates from a previous conversation", () => {
        publishVoiceHud(state("old"));
        publishVoiceHud({ ...state("new"), status: "speaking", response: "A new response" });
        resetVoiceHud("old");
        publishVoiceHud({ ...state("old"), active: false });
        expect($voiceHud.get()).toMatchObject({ owner: "new", active: true, response: "A new response" });
        resetVoiceHud("new");
        expect($voiceHud.get()).toMatchObject({ active: false, status: "idle", response: "" });
    });

    it("clamps microphone levels and caps native transcript payloads", () => {
        publishVoiceHud({ ...state("bounds"), transcript: "x".repeat(3_000), response: "y".repeat(3_000), level: 30 });
        expect($voiceHud.get().transcript).toHaveLength(2_000);
        expect($voiceHud.get().response).toHaveLength(2_000);
        expect($voiceHud.get().level).toBe(1);
        publishVoiceHud({ ...state("bounds"), level: NaN });
        expect($voiceHud.get().level).toBe(0);
        resetVoiceHud("bounds");
    });

    it("keeps a muted conversation active while its microphone is idle", () => {
        publishVoiceHud({ ...state("mute"), muted: true, status: "idle", transcript: "Previous utterance" });
        expect($voiceHud.get()).toMatchObject({ active: true, muted: true, transcript: "Previous utterance" });
        resetVoiceHud("mute");
    });
});
