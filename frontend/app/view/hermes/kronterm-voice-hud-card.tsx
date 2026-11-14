import { $voiceHud, type VoiceHudControl } from "@hermes/store/voice-hud";
import { useStore } from "@nanostores/react";
import { Mic, MicOff, Square, Volume2 } from "lucide-react";

export function KrontermVoiceHudCard({ onClose }: { onClose?: () => void }) {
    const voice = useStore($voiceHud);
    if (!voice.active) return null;
    const control = (action: VoiceHudControl) => {
        window.dispatchEvent(new CustomEvent("kronterm:voice-control", { detail: { action } }));
        if (action === "stop") onClose?.();
    };
    const labels = {
        idle: "Voice ready",
        listening: "Listening…",
        transcribing: "Transcribing…",
        thinking: "KronOS is thinking",
        speaking: "KronOS is speaking",
        error: "Voice unavailable",
    };
    return (
        <aside
            aria-label="KronOS voice conversation"
            data-coucou-voice-card=""
            className="pointer-events-auto fixed inset-x-3 top-12 z-[116] flex min-h-[98px] items-center gap-5 overflow-hidden rounded-[18px] border border-white/10 bg-[#121317] px-7 py-4 text-white shadow-2xl"
        >
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_100%,#6b2b5555,transparent_70%)]"
            />
            <div
                className="relative grid h-14 w-[74px] shrink-0 place-items-center rounded-[18px] bg-white text-black"
                style={{ boxShadow: `0 0 ${8 + voice.level * 24}px #967aff55` }}
            >
                {voice.muted ? (
                    <MicOff className="h-6 w-6" />
                ) : voice.status === "speaking" ? (
                    <Volume2 className="h-6 w-6" />
                ) : (
                    <Mic className="h-6 w-6" />
                )}
            </div>
            <div className="relative min-w-0 flex-1" aria-live="polite" aria-atomic="true">
                <p className="truncate text-[15px] font-semibold">
                    {voice.muted ? "Microphone muted" : labels[voice.status]}
                </p>
                <p className="mt-1 truncate text-[13px] text-white/55">
                    {voice.error ||
                        (voice.transcript
                            ? `You: ${voice.transcript}`
                            : voice.status === "transcribing"
                              ? "Transcribing…"
                              : voice.status === "listening"
                                ? "Transcript appears after you finish speaking"
                                : "Say something to KronOS…")}
                </p>
                {voice.response && (
                    <p className="mt-1 truncate text-[13px] text-[#c7b9ff]">KronOS: {voice.response}</p>
                )}
            </div>
            <div className="relative flex gap-1">
                {voice.status === "error" && (
                    <button
                        className="h-8 cursor-pointer rounded-full px-3 hover:bg-white/10"
                        onClick={() => control("retry")}
                    >
                        Retry voice
                    </button>
                )}
                <button
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-white/10"
                    onClick={() => control("mute")}
                    aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
                    title={voice.muted ? "Unmute" : "Mute"}
                >
                    <MicOff className="h-4 w-4" />
                </button>
                {voice.status === "speaking" || voice.status === "thinking" ? (
                    <button
                        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-white/10"
                        onClick={() => control("interrupt")}
                        aria-label="Interrupt reply"
                        title="Interrupt reply"
                    >
                        <Volume2 className="h-4 w-4" />
                    </button>
                ) : null}
                <button
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-white/10"
                    onClick={() => control("stop")}
                    aria-label="End voice conversation"
                    title="End voice"
                >
                    <Square className="h-4 w-4" />
                </button>
            </div>
        </aside>
    );
}
