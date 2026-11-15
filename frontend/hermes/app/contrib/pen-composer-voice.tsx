// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useComposerVoice } from "@hermes/app/chat/composer/hooks/use-composer-voice";
import { ComposerScopeProvider, MAIN_COMPOSER_SCOPE } from "@hermes/app/chat/composer/scope";
import { $busy, $messages } from "@hermes/store/session";
import { $sessionStates } from "@hermes/store/session-states";
import { useStore } from "@nanostores/react";
import { computed } from "nanostores";
import { useEffect, useMemo, useRef, useState } from "react";

export const PenVoiceEvent = "kronos:pen-composer-voice";

type VoiceUpdate = { active?: boolean; dictation?: string; text?: string; prompt?: string; stop?: boolean; error?: string };
export type PenVoiceRequest = {
    tabId: string;
    conversationId: string;
    runtimeId?: string;
    action: "conversation" | "dictation" | "cancel";
    publish: (update: VoiceUpdate) => Promise<unknown>;
    handled?: boolean;
};

type VoiceConfig = { transcribe: (audio: Blob) => Promise<string>; maxSeconds: number };
const EmptyMessages = [];

function PenVoiceSession({ request, transcribe, maxSeconds }: VoiceConfig & { request: PenVoiceRequest }) {
    const mainBusy = useStore($busy);
    const sessions = useStore($sessionStates);
    const seen = useRef<PenVoiceRequest>(null);
    const busy = request.runtimeId ? Boolean(sessions[request.runtimeId]?.busy) : mainBusy;
    const voice = useComposerVoice({
        busy,
        disabled: false,
        clearDraft: () => {},
        focusInput: () => {},
        insertText: (text) => void request.publish({ text }).catch(() => {}),
        maxRecordingSeconds: maxSeconds,
        onInterrupt: async () => { await request.publish({ stop: true }); },
        onSubmit: async (prompt) => {
            const result = await request.publish({ prompt }) as { success?: boolean };
            return result?.success === true;
        },
        onTranscribeAudio: async (audio) => {
            try {
                void request.publish({ error: "" }).catch(() => {});
                return await transcribe(audio);
            } catch (error) {
                void request.publish({ error: error instanceof Error ? error.message : "Transcription failed." }).catch(() => {});
                throw error;
            }
        },
        sessionId: request.runtimeId,
        target: "pen",
    });
    useEffect(() => {
        if (seen.current === request) return;
        seen.current = request;
        if (request.action === "conversation" && voice.voiceStatus === "idle") {
            if (voice.voiceConversationActive) voice.endConversation();
            else voice.startConversation();
        }
        if (request.action === "dictation" && !voice.voiceConversationActive) void voice.dictate();
    }, [request, voice]);
    useEffect(() => {
        void request.publish({ active: voice.voiceConversationActive, dictation: voice.voiceStatus }).catch(() => {});
    }, [request, voice.voiceConversationActive, voice.voiceStatus]);
    return null;
}

export function PenComposerVoice(config: VoiceConfig) {
    const [request, setRequest] = useState<PenVoiceRequest>();
    useEffect(() => {
        const receive = (event: Event) => {
            const next = (event as CustomEvent<PenVoiceRequest>).detail;
            if (!next || next.handled) return;
            next.handled = true;
            setRequest((current) => {
                if (next.action === "cancel") return current?.tabId === next.tabId &&
                    (!next.conversationId || current.conversationId === next.conversationId) ? undefined : current;
                return next;
            });
        };
        window.addEventListener(PenVoiceEvent, receive);
        return () => window.removeEventListener(PenVoiceEvent, receive);
    }, []);
    const runtimeId = request?.runtimeId;
    const scope = useMemo(() => ({
        ...MAIN_COMPOSER_SCOPE,
        target: "pen",
        $messages: runtimeId
            ? computed($sessionStates, (states) => states[runtimeId]?.messages ?? EmptyMessages)
            : $messages,
    }), [runtimeId]);
    if (!request) return null;
    return (
        <ComposerScopeProvider value={scope}>
            <PenVoiceSession key={request.tabId + ":" + request.conversationId} request={request} {...config} />
        </ComposerScopeProvider>
    );
}
