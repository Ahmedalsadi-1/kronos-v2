import { useEffect, useRef } from "react";

import { isKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import {
    $composerDraft,
    addComposerAttachment,
    setComposerDraft,
    type ComposerAttachment,
} from "@hermes/store/composer";
import {
    initQuickEntryBridge,
    QUICK_TARGET_CURRENT,
    QUICK_TARGET_NEW,
    registerCanvasChatSubmit,
    setQuickEntrySubmitHandler,
    type QuickEntrySessionOption,
} from "@hermes/store/quick-entry";
import { $gatewayState, $sessions } from "@hermes/store/session";
import { sessionTileDelegate } from "@hermes/store/session-states";
import { isAuxiliaryWindow } from "@hermes/store/windows";
import { deliverQuickEntryImages } from "./quick-entry-image-delivery";

interface QuickEntryBridgeParams {
    cancelRun?: () => Promise<unknown>;
    startFreshSessionDraft: () => void;
    submitText: (
        text: string,
        options?: { attachments: ComposerAttachment[]; displayText?: string; sessionId?: string; storedSessionId?: string }
    ) => Promise<unknown> | unknown;
}

// The picker is a capture aid, not a session browser — a handful of recent
// rows is the whole point.
const QUICK_ENTRY_SESSION_OPTIONS = 5;

function sessionOptions(): QuickEntrySessionOption[] {
    return $sessions
        .get()
        .filter((session) => !session.archived)
        .slice(0, QUICK_ENTRY_SESSION_OPTIONS)
        .map((session) => ({
            id: session.id,
            title: session.title?.trim() || session.preview?.trim() || session.id,
        }));
}

/**
 * Wires the global-hotkey Quick Entry window back into the app, both ways:
 *
 * - **Inbound:** text captured there is routed by target and submitted through
 *   THIS window's normal prompt machinery — current chat rides `submitText`, a
 *   picked stored session rides the session-tile delegate (resume + submit,
 *   background, without touching the primary view — the same path tiled
 *   sessions use), and "new session" is a fresh draft + submit, exactly what
 *   clicking New Chat and typing does. One submit pipeline, no bespoke RPC.
 * - **Outbound:** gateway connection state + the recent-session list are pushed
 *   to the quick window (via main, which caches the latest push), so its input
 *   disables with a reconnect hint whenever the backend is unreachable.
 *
 * Handlers register ONCE through refs tracking the latest callbacks —
 * re-registering on identity churn leaves a nulled-handler window that can drop
 * a submit (the same bug shape use-pet-bridge guards). Primary window only: a
 * secondary session window must not also claim the global capture channel, or
 * one keystroke would send N prompts.
 */
export function useQuickEntryBridge({ startFreshSessionDraft, submitText, cancelRun }: QuickEntryBridgeParams): void {
    const cancelRef = useRef(cancelRun);
    cancelRef.current = cancelRun;
    const submitTextRef = useRef(submitText);
    submitTextRef.current = submitText;
    const startFreshRef = useRef(startFreshSessionDraft);
    startFreshRef.current = startFreshSessionDraft;

    useEffect(() => {
        if (!isKronTermWidgetHost()) return;
        return registerCanvasChatSubmit(
            async (text, displayText, attachments = [], sessionId, storedSessionId) => submitTextRef.current(text, { attachments, displayText, sessionId, storedSessionId }),
            async () => cancelRef.current?.()
        );
    }, []);

    useEffect(() => {
        if (isAuxiliaryWindow()) {
            return;
        }

        setQuickEntrySubmitHandler(({ target, text, images }) => {
            if (images?.length) {
                if (target === QUICK_TARGET_NEW) startFreshRef.current();
                void deliverQuickEntryImages({ target, text, images }, submitTextRef.current, (draft, attachments) => {
                    const existing = $composerDraft.get();
                    setComposerDraft(existing ? `${existing}\n\n${draft}` : draft);
                    attachments.forEach(addComposerAttachment);
                });
                return;
            }
            if (target === QUICK_TARGET_NEW) {
                // Same as the user clicking New Chat and typing: fresh draft, then the
                // normal submit creates the backend session.
                startFreshRef.current();
                void submitTextRef.current(text);

                return;
            }

            if (target !== QUICK_TARGET_CURRENT) {
                // A picked stored session: resume + submit in the background through
                // the session-tile delegate so the primary view stays where it is.
                const delegate = sessionTileDelegate();

                if (delegate) {
                    void delegate
                        .resumeTile(target)
                        .then((runtimeId) => delegate.submitToSession(runtimeId, text))
                        // A dead/undeliverable target must not swallow the prompt.
                        .catch(() => void submitTextRef.current(text));

                    return;
                }
            }

            void submitTextRef.current(text);
        });

        const dispose = initQuickEntryBridge();
        return () => {
            setQuickEntrySubmitHandler(null);
            dispose();
        };
    }, []);

    // Push gateway truth into the quick window whenever it changes: connection
    // state gates its input; the recent-session list feeds its target picker.
    useEffect(() => {
        if (isAuxiliaryWindow()) {
            return;
        }

        const api = window.hermesDesktop?.quickEntry;

        if (!api?.pushState) {
            return;
        }

        const push = () => {
            api.pushState({ connected: $gatewayState.get() === "open", sessions: sessionOptions() });
        };

        push();

        const offGateway = $gatewayState.listen(push);
        const offSessions = $sessions.listen(push);

        return () => {
            offGateway();
            offSessions();
        };
    }, []);
}
