import { atom } from "nanostores";

export interface VoiceHudState {
    owner: string;
    active: boolean;
    status: "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
    transcript: string;
    response: string;
    muted: boolean;
    level: number;
    error: string | null;
}

export type VoiceHudControl = "mute" | "stop" | "interrupt" | "retry";

export const $voiceHud = atom<VoiceHudState>({
    owner: "",
    active: false,
    status: "idle",
    transcript: "",
    response: "",
    muted: false,
    level: 0,
    error: null,
});

export function publishVoiceHud(state: VoiceHudState) {
    const current = $voiceHud.get();
    if (!state.active && current.owner !== state.owner) return;
    const next = {
        ...state,
        transcript: state.transcript.slice(-2_000),
        response: state.response.slice(-2_000),
        level: Number.isFinite(state.level) ? Math.max(0, Math.min(1, state.level)) : 0,
    };
    $voiceHud.set(next);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("kronterm:voice-state", { detail: next }));
}

export function resetVoiceHud(owner: string) {
    if ($voiceHud.get().owner !== owner) return;
    publishVoiceHud({
        owner,
        active: false,
        status: "idle",
        transcript: "",
        response: "",
        muted: false,
        level: 0,
        error: null,
    });
}
