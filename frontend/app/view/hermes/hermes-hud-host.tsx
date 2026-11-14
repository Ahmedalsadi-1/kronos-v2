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
import {
    $krontermInspectorHasFiles,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorTarget,
    $krontermSidebarTarget,
    KrontermInspectorChatEvent,
    KrontermInspectorChatTargetId,
    KrontermSidebarActivateEvent,
} from "@hermes/lib/kronterm-sidebar";
import { ComposerAttachmentUserRemovedEvent, mainComposerScope, type ComposerAttachment } from "@hermes/store/composer";
import { $sidebarOpen } from "@hermes/store/layout";
import { useStore } from "@nanostores/react";
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { makeCanvasAttachments, mergeCanvasAttachments } from "./hermes-canvas-context";
import { HermesChatMount } from "./hermes-chat-mount";
import { installHermesDesktopShim } from "./hermes-desktop-shim";
import { HermesHudFrame, HermesHudOverlay } from "./hermes-hud-overlay";
import { HermesHudStreamCard } from "./hermes-hud-stream-card";
import { HermesLoadBoundary } from "./hermes-load-boundary";
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
    tabId,
    placement = "floating",
}: {
    placement?: "floating" | "bottom" | "top" | "shell";
    autoOpen: boolean;
    canvasContext: WorkspaceCanvasComposerContext;
    tabId: string;
}) {
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const chatActive = surface.presentation === "hud" || surface.presentation === "panel";
    const sidebarTarget = useStore($krontermSidebarTarget);
    const sidebarOpen = useStore($sidebarOpen);
    const inspectorTarget = useStore($krontermInspectorTarget);
    const inspectorOpen = useStore($krontermInspectorOpen);
    const inspectorHasFiles = useStore($krontermInspectorHasFiles);
    const dockedChat = surface.presentation === "panel" && Boolean(inspectorTarget);
    const sidebarActive =
        (Boolean(sidebarTarget) && sidebarOpen) || (Boolean(inspectorTarget) && (inspectorOpen || inspectorHasFiles));
    const { ready: connectionReady, error, retry } = useHermesConnection(tabId, chatActive || sidebarActive);
    const krontermHudMode = useKrontermHudMode();
    const previousAutoOpenRef = useRef(false);
    const managedAttachmentsRef = useRef<ComposerAttachment[]>([]);
    const dismissedIdsRef = useRef(new Set<string>());
    const selectionKeyRef = useRef("");
    ensureShim();

    useEffect(() => {
        const dock = () => hermesSurfaceController.requestOpenPanel();
        window.addEventListener(KrontermInspectorChatEvent, dock);
        return () => window.removeEventListener(KrontermInspectorChatEvent, dock);
    }, []);
    useEffect(() => {
        if (!dockedChat) return;
        $krontermInspectorOpen.set(true);
        $krontermInspectorSection.set("chat");
    }, [dockedChat]);
    useEffect(() => {
        const activate = () => {
            if (hermesSurfaceController.getSnapshot().presentation === "closed") {
                hermesSurfaceController.requestOpenHud();
            }
        };
        window.addEventListener(KrontermSidebarActivateEvent, activate);
        return () => window.removeEventListener(KrontermSidebarActivateEvent, activate);
    }, []);

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

    if (!chatActive && !sidebarActive) {
        return null;
    }

    const { x, y, width, height } = surface.geometry;
    const sidebarStatus = (content: React.ReactNode) => (
        <>
            {sidebarTarget && sidebarOpen && createPortal(content, sidebarTarget)}
            {inspectorTarget && inspectorOpen && createPortal(content, inspectorTarget)}
        </>
    );

    return (
        <>
            <div id={`hermes-chat-closed-${tabId}`} hidden />
            <HermesChatMount
                targetId={dockedChat ? KrontermInspectorChatTargetId : `hermes-chat-${surface.presentation}-${tabId}`}
            >
                {connectionReady ? (
                    <HermesLoadBoundary>
                        <Suspense
                            fallback={
                                <>
                                    <div className="hermes-workspace-panel-state">Loading KronOS Agent…</div>
                                    {sidebarStatus(<HermesConnectionState error="" retry={retry} />)}
                                </>
                            }
                        >
                            <LazyHermesApp hudMode dockedChat={dockedChat} />
                        </Suspense>
                    </HermesLoadBoundary>
                ) : (
                    <>
                        <HermesConnectionState error={error} retry={retry} />
                        {sidebarStatus(<HermesConnectionState error={error} retry={retry} />)}
                    </>
                )}
            </HermesChatMount>
            {surface.presentation === "hud" && (
                <HermesHudOverlay targetId={placement === "shell" ? `hermes-hud-shell-${tabId}` : undefined}>
                    {placement === "floating" &&
                        (krontermHudMode.active ? (
                            <KrontermHudModeCard hudGeometry={{ x, y, width }} mode={krontermHudMode} />
                        ) : (
                            <HermesHudStreamCard hudGeometry={{ x, y, width }} />
                        ))}
                    {placement === "floating" && <KrontermVoiceHudCard onClose={() => undefined} />}
                    <HermesHudFrame placement={placement} geometry={{ x, y, width, height }}>
                        <div
                            id={`hermes-chat-hud-${tabId}`}
                            className="pointer-events-auto h-full min-h-0 min-w-0 overflow-hidden"
                        />
                    </HermesHudFrame>
                </HermesHudOverlay>
            )}
        </>
    );
}

export function HermesPanelHost({ tabId }: { tabId: string }) {
    return (
        <section
            className="hermes-workspace-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
            aria-label="Kronos side panel"
        >
            <div className="hermes-workspace-panel-actions flex shrink-0 justify-end p-2">
                <button
                    type="button"
                    onClick={() => hermesSurfaceController.requestOpenHud()}
                    aria-label="Return to HUD"
                    title="Return to HUD"
                    className="flex cursor-pointer items-center gap-2 text-xs focus-visible:outline-2"
                >
                    <i className="fa-solid fa-window-restore" aria-hidden="true" />
                    Return to HUD
                </button>
            </div>
            <div
                id={`hermes-chat-panel-${tabId}`}
                className="hermes-workspace-panel-content min-h-0 min-w-0 flex-1 overflow-hidden"
            />
        </section>
    );
}
