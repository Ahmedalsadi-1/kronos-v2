// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemAppearanceContext, SystemButton } from "@/app/components/system-ui";
import "@/app/workspace/coucou-chrome.css";
import { NativeHudFallback } from "@/app/workspace/native-hud-fallback";
import { getApi } from "@/store/global";
import { systemMaterialVariables } from "@/types/system-materials";
import "@hermes/styles.css";
import { useEffect, useState } from "react";

export function NotchSystemPreview() {
    const [appearance, setAppearance] = useState<SystemAppearanceSnapshot>({
        colorScheme: "light",
        contrast: "normal",
        reducedMotion: false,
        reducedTransparency: false,
    });
    const [feedback, setFeedback] = useState("Preview fixture. Native actions are simulated here.");
    const [draft, setDraft] = useState("");
    useEffect(() => {
        const api = getApi();
        const saved = {
            setHudWindowMode: api.setHudWindowMode,
            requestNativeHudLaunch: api.requestNativeHudLaunch,
            requestNativeHudExit: api.requestNativeHudExit,
        };
        api.setHudWindowMode = () => setFeedback("Retry requested. The preview conversation remains mounted.");
        api.requestNativeHudLaunch = (app) => setFeedback(`Open ${app} requested.`);
        api.requestNativeHudExit = () => setFeedback("Return to workspace requested.");
        return () => {
            Object.assign(api, saved);
        };
    }, []);
    return (
        <SystemAppearanceContext.Provider value={appearance}>
            <div
                className="kt-system-ui"
                style={{
                    ...systemMaterialVariables(appearance),
                    position: "relative",
                    inset: "auto",
                    width: "100%",
                    minHeight: "calc(100vh - 100px)",
                    padding: 24,
                    background: "var(--kt-content)",
                }}
                data-color-scheme={appearance.colorScheme}
                data-contrast={appearance.contrast}
                data-reduced-motion={appearance.reducedMotion || undefined}
                data-reduced-transparency={appearance.reducedTransparency || undefined}
            >
                <header className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 pb-6">
                    <strong className="mr-auto">Notch system appearance</strong>
                    <SystemButton
                        size="small"
                        selected={appearance.colorScheme === "light"}
                        onClick={() => setAppearance({ ...appearance, colorScheme: "light" })}
                    >
                        Light
                    </SystemButton>
                    <SystemButton
                        size="small"
                        selected={appearance.colorScheme === "dark"}
                        onClick={() => setAppearance({ ...appearance, colorScheme: "dark" })}
                    >
                        Dark
                    </SystemButton>
                    <label className="flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            checked={appearance.contrast === "high"}
                            onChange={(event) =>
                                setAppearance({ ...appearance, contrast: event.target.checked ? "high" : "normal" })
                            }
                        />
                        Increased contrast
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            checked={appearance.reducedMotion}
                            onChange={(event) =>
                                setAppearance({
                                    ...appearance,
                                    reducedMotion: event.target.checked,
                                    reducedTransparency: event.target.checked,
                                })
                            }
                        />
                        Reduce motion and transparency
                    </label>
                </header>
                <section
                    data-coucou-hud=""
                    data-color-scheme={appearance.colorScheme}
                    data-reduced-motion={appearance.reducedMotion || undefined}
                    data-reduced-transparency={appearance.reducedTransparency || undefined}
                    className="native-hud-shell mx-auto flex w-full max-w-xl flex-col overflow-hidden border"
                    style={{ borderColor: "var(--kt-separator)", minHeight: 420 }}
                >
                    <header className="border-b p-4" style={{ borderColor: "var(--kt-separator)" }}>
                        Kronos conversation
                    </header>
                    <div data-hud-native-notch="" className="flex min-h-0 flex-1 flex-col p-4">
                        <div data-chat-surface="" className="flex-1">
                            <div data-slot="aui_assistant-message-content">
                                Your conversation stays available while the native panel recovers.
                            </div>
                            <p className="mt-3 text-xs" style={{ color: "var(--kt-label-secondary)" }}>
                                Changing appearance preserves the draft below.
                            </p>
                        </div>
                        <form
                            data-slot="composer-surface"
                            className="mt-8 flex items-center gap-2 p-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (draft.trim()) {
                                    setFeedback(`Preview message: ${draft}`);
                                    setDraft("");
                                }
                            }}
                        >
                            <input
                                aria-label="Preview message"
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                placeholder="Write a message"
                                className="min-w-0 flex-1 bg-transparent p-2"
                            />
                            <SystemButton type="submit" size="small" disabled={!draft.trim()}>
                                Send
                            </SystemButton>
                        </form>
                    </div>
                    <NativeHudFallback sessionId="preview-session" />
                </section>
                <p
                    role="status"
                    className="mx-auto mt-4 max-w-xl text-xs"
                    style={{ color: "var(--kt-label-secondary)" }}
                >
                    {feedback}
                </p>
            </div>
        </SystemAppearanceContext.Provider>
    );
}
