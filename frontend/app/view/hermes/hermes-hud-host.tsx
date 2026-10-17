// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    publishWorkspaceCanvasComposerSubmit,
    type WorkspaceCanvasComposerContext,
} from "@/app/tab/workspace-canvas-context";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import {
    HermesComposerSubmittedEvent,
    type HermesComposerSubmitted,
} from "@hermes/app/chat/composer/hooks/use-composer-submit";
import { markKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import { ComposerAttachmentUserRemovedEvent, mainComposerScope, type ComposerAttachment } from "@hermes/store/composer";
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { makeCanvasAttachments, mergeCanvasAttachments } from "./hermes-canvas-context";
import { installHermesDesktopShim } from "./hermes-desktop-shim";
import { HermesHudOverlay } from "./hermes-hud-overlay";
import { HermesHudStreamCard } from "./hermes-hud-stream-card";
import { hermesSurfaceController } from "./hermes-surface-controller";
import { useKrontermHudMode } from "./kronterm-hud-mode";
import { KrontermHudModeCard } from "./kronterm-hud-mode-card";
import { KrontermVoiceHudCard } from "./kronterm-voice-hud-card";
import { HermesConnectionState, useHermesConnection } from "./use-hermes-connection";

const LazyHermesApp = lazy(async () => ({ default: (await import("./hermes-app")).HermesApp }));

let shimInstalled = false;

function ensureShim(): void {
    markKronTermWidgetHost();
    if (shimInstalled) {
        return;
    }
    shimInstalled = true;
    installHermesDesktopShim({ baseUrl: "http://127.0.0.1:9119" });
}

function requestPreferredKronosSurface(): void {
    hermesSurfaceController.requestOpenHud();
}

export function HermesHudHost({
    autoOpen,
    canvasContext,
    onExpand,
    tabId,
}: {
    autoOpen: boolean;
    canvasContext: WorkspaceCanvasComposerContext;
    onExpand: () => Promise<void>;
    tabId: string;
}) {
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const { ready: connectionReady, error, retry } = useHermesConnection(tabId, surface.presentation === "hud");
    const krontermHudMode = useKrontermHudMode();
    const previousAutoOpenRef = useRef(false);
    const managedAttachmentsRef = useRef<ComposerAttachment[]>([]);
    const dismissedIdsRef = useRef(new Set<string>());
    const selectionKeyRef = useRef("");
    ensureShim();

    useEffect(() => hermesSurfaceController.setExpandHandler(onExpand), [onExpand]);

    useEffect(() => {
        if (
            autoOpen &&
            !previousAutoOpenRef.current &&
            hermesSurfaceController.getSnapshot().presentation === "closed"
        ) {
            requestPreferredKronosSurface();
        }
        previousAutoOpenRef.current = autoOpen;
    }, [autoOpen, surface.presentation]);

    useEffect(() => {
        const onRemoved = (event: Event) => {
            const attachment = (event as CustomEvent<ComposerAttachment>).detail;
            if (attachment.source !== "kronterm-canvas") {
                return;
            }
            dismissedIdsRef.current.add(attachment.id);
        };
        window.addEventListener(ComposerAttachmentUserRemovedEvent, onRemoved);
        return () => window.removeEventListener(ComposerAttachmentUserRemovedEvent, onRemoved);
    }, []);

    useEffect(() => {
        const selectionKey = `${canvasContext.tabid}:${canvasContext.nodes.map((node) => node.id).join("|")}`;
        if (selectionKey !== selectionKeyRef.current) {
            selectionKeyRef.current = selectionKey;
            dismissedIdsRef.current.clear();
        }
        const managed = makeCanvasAttachments(canvasContext);
        managedAttachmentsRef.current = managed;
        mainComposerScope.$attachments.set(
            mergeCanvasAttachments(mainComposerScope.$attachments.get(), managed, dismissedIdsRef.current)
        );
    }, [canvasContext]);

    useEffect(() => {
        const onSubmitted = (event: Event) => {
            const detail = (event as CustomEvent<HermesComposerSubmitted>).detail;
            const canvasAttachments = detail.attachments.filter(
                (attachment) => attachment.source === "kronterm-canvas" && attachment.sourceId
            );
            if (canvasAttachments.length === 0) {
                return;
            }
            const submitted = canvasAttachments[0];
            publishWorkspaceCanvasComposerSubmit({
                contextids: canvasAttachments
                    .filter(
                        (attachment) =>
                            attachment.sourceTabId === submitted.sourceTabId &&
                            attachment.sourceMode === submitted.sourceMode
                    )
                    .map((attachment) => attachment.sourceId!),
                mode: submitted.sourceMode ?? "follow",
                prompt: detail.text,
                tabid: submitted.sourceTabId ?? "",
            });
            queueMicrotask(() => {
                mainComposerScope.$attachments.set(
                    mergeCanvasAttachments(
                        mainComposerScope.$attachments.get(),
                        managedAttachmentsRef.current,
                        dismissedIdsRef.current
                    )
                );
            });
        };
        window.addEventListener(HermesComposerSubmittedEvent, onSubmitted);
        return () => window.removeEventListener(HermesComposerSubmittedEvent, onSubmitted);
    }, []);

    useEffect(() => {
        const clamp = () => hermesSurfaceController.clampToViewport();
        window.addEventListener("resize", clamp);
        return () => window.removeEventListener("resize", clamp);
    }, []);

    useEffect(() => {
        if (surface.presentation !== "hud") {
            return;
        }
        const exitHud = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) {
                return;
            }
            kronTermHudController.setActive(false);
            hermesSurfaceController.dismiss();
        };
        window.addEventListener("keydown", exitHud);
        return () => window.removeEventListener("keydown", exitHud);
    }, [surface.presentation]);

    useEffect(() => {
        const toggleFromShortcut = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
                event.preventDefault();
                event.stopPropagation();
                const active = kronTermHudController.toggle();
                if (active) hermesSurfaceController.requestOpenHud();
                else hermesSurfaceController.dismiss();
            }
        };
        window.addEventListener("keydown", toggleFromShortcut, true);
        return () => window.removeEventListener("keydown", toggleFromShortcut, true);
    }, []);

    if (surface.presentation !== "hud") {
        return null;
    }

    const { x, y, width, height } = surface.geometry;

    return (
        <HermesHudOverlay>
            {krontermHudMode.active ? (
                <KrontermHudModeCard hudGeometry={{ x, y, width }} mode={krontermHudMode} />
            ) : (
                <HermesHudStreamCard hudGeometry={{ x, y, width }} />
            )}
            <KrontermVoiceHudCard onClose={() => undefined} />
            <div
                aria-label="KronTerm Agent HUD"
                className="pointer-events-none fixed z-[115] overflow-visible"
                data-kronterm-hermes-hud=""
                style={{ left: x, top: y, width, height }}
            >
                {connectionReady ? (
                    <Suspense
                        fallback={
                            <div className="pointer-events-auto grid h-full place-items-center rounded-xl border border-white/10 bg-[#080a0df2] text-xs text-white/55 shadow-2xl backdrop-blur-xl">
                                Loading Kronos…
                            </div>
                        }
                    >
                        <LazyHermesApp hudMode />
                    </Suspense>
                ) : (
                    <div className="pointer-events-auto grid h-full place-items-center rounded-xl border border-white/10 bg-[#080a0df2] text-xs text-white/55 shadow-2xl backdrop-blur-xl">
                        <HermesConnectionState error={error} retry={retry} />
                    </div>
                )}
            </div>
        </HermesHudOverlay>
    );
}

export function HermesPanelHost({ tabId }: { tabId: string }) {
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const { ready: connectionReady, error, retry } = useHermesConnection(tabId, surface.presentation === "panel");
    ensureShim();

    return (
        <section
            className="hermes-workspace-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
            aria-label="Kronos side panel"
        >
            <div className="hermes-workspace-panel-actions flex shrink-0 justify-end p-2">
                <button
                    type="button"
                    onClick={() => hermesSurfaceController.requestOpenHud()}
                    aria-label="Move Kronos to HUD"
                    title="Move to HUD"
                    className="cursor-pointer"
                >
                    <i className="fa-solid fa-window-restore" aria-hidden="true" />
                </button>
            </div>
            <div className="hermes-workspace-panel-content min-h-0 min-w-0 flex-1 overflow-hidden">
                {connectionReady ? (
                    <Suspense fallback={<div className="hermes-workspace-panel-state">Loading Kronos…</div>}>
                        <LazyHermesApp panelMode />
                    </Suspense>
                ) : (
                    <HermesConnectionState error={error} retry={retry} />
                )}
            </div>
        </section>
    );
}
