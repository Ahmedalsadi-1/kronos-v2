import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { getWorkspaceSurfaceModeProvider } from "@/app/tab/workspace-surface-runtime";
import { listAgentWidgets } from "@/app/view/agent-widget-bridge";
import { atoms, getApi, getBlockComponentModel } from "@/store/global";
import type { PrimitiveAtom } from "jotai";
import { useEffect } from "react";
import {
    isAgentActivityActive,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "../../types/agent-activity";
import { terminalAgentBackend, type NotchAgent } from "../../types/native-notch";

export function captureNativeNotchFrame(element: HTMLElement): string | undefined {
    const video = element.querySelector("video");
    const source =
        video?.videoWidth > 0 && video.readyState >= 2
            ? video
            : Array.from(element.querySelectorAll("canvas")).find((canvas) => canvas.width > 0 && canvas.height > 0);
    if (!source) return;
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const thumbnail = document.createElement("canvas");
    thumbnail.width = Math.min(960, width);
    thumbnail.height = Math.max(1, Math.round((height * thumbnail.width) / width));
    try {
        const context = thumbnail.getContext("2d");
        if (!context) return;
        context.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
        return thumbnail.toDataURL("image/jpeg", 0.7).split(",")[1];
    } catch {
        return;
    }
}

export function useNativeNotchPreview(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        let selectedBlockId: string;
        let expanded = true;
        const offSelection = getApi().onNativeHudSelectWidget(({ blockId, expanded: nextExpanded }) => {
            selectedBlockId = blockId;
            expanded = nextExpanded;
        });
        const activityByAgent = new Map<string, LiveAgentSurfaceActivity>();
        const offActivity = subscribeAgentActivityStream((activity) => {
            activityByAgent.set(
                `${activity.sessionid ?? activity.runid ?? activity.source}:${activity.blockid ?? ""}`,
                activity
            );
        });
        const publish = () => {
            const islandId =
                new URLSearchParams(window.location.search).get("nativeSurface") === "island"
                    ? new URLSearchParams(window.location.search).get("blockId")
                    : undefined;
            const focusedId = getWorkspaceSurfaceModeProvider(globalStore.get(atoms.staticTabId))?.snapshot()
                ?.selectedblockid;
            const previews = listAgentWidgets()
                .filter((widget) => !islandId || widget.id === islandId)
                .map((widget) => {
                    const id = widget.id;
                    const element = document.querySelector<HTMLElement>(`[data-blockid="${CSS.escape(id)}"]`);
                    const model = getBlockComponentModel(id)?.viewModel as {
                        webviewRef?: { current?: Electron.WebviewTag };
                    };
                    let guestId: number;
                    try {
                        guestId = model?.webviewRef?.current?.getWebContentsId();
                    } catch {
                        /* Guest is attaching. */
                    }
                    const bounds = element?.getBoundingClientRect();
                    const x = Math.max(0, Math.round(bounds?.x ?? 0));
                    const y = Math.max(0, Math.round(bounds?.y ?? 0));
                    const width = Math.max(0, Math.min(Math.round(bounds?.right ?? 0) - x, window.innerWidth - x));
                    const height = Math.max(0, Math.min(Math.round(bounds?.bottom ?? 0) - y, window.innerHeight - y));
                    return {
                        ...widget,
                        focused: focusedId ? focusedId === id : widget.focused,
                        devicePlatform:
                            widget.view === "linux-vms"
                                ? globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", id)))?.meta?.[
                                      "machine:kind"
                                  ]
                                : undefined,
                        rect: { x, y, width, height },
                        guestId,
                        image:
                            element &&
                            expanded &&
                            widget.id === (selectedBlockId ?? islandId ?? focusedId) &&
                            ["appstream", "sandbox"].includes(widget.view)
                                ? captureNativeNotchFrame(element)
                                : undefined,
                    };
                });
            const agents = new Map<string, NotchAgent>();
            for (const [id, activity] of activityByAgent) {
                if (Date.now() - activity.timestamp > 45000 || !isAgentActivityActive(activity.phase)) {
                    activityByAgent.delete(id);
                    continue;
                }
                const backend =
                    terminalAgentBackend(activity.connectorid) ??
                    (activity.source === "hermes" ? "hermes" : "kronoscode");
                agents.set(id, {
                    id,
                    backend,
                    name: backend === "opencode" ? "OpenCode" : backend.charAt(0).toUpperCase() + backend.slice(1),
                    detail: activity.detail ?? activity.action,
                    phase: activity.phase,
                    blockId: activity.blockid,
                });
            }
            for (const widget of previews.filter((row) => row.view === "term")) {
                const model = getBlockComponentModel(widget.id)?.viewModel as {
                    termRef?: {
                        current?: {
                            lastCommandAtom: PrimitiveAtom<string>;
                            shellIntegrationStatusAtom: PrimitiveAtom<string>;
                        };
                    };
                };
                const term = model?.termRef?.current;
                const meta = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", widget.id)))?.meta;
                const command = term ? globalStore.get(term.lastCommandAtom) : String(meta?.["cmd"] ?? "");
                const backend = terminalAgentBackend(command);
                const running = term
                    ? globalStore.get(term.shellIntegrationStatusAtom) === "running-command"
                    : Boolean(meta?.cmd);
                if (backend && running)
                    agents.set(widget.id, {
                        id: widget.id,
                        backend,
                        name: backend === "opencode" ? "OpenCode" : backend.charAt(0).toUpperCase() + backend.slice(1),
                        detail: widget.detail ?? "Working in terminal",
                        phase: "running",
                        blockId: widget.id,
                    });
            }
            getApi().syncNativeNotch({ previews, agents: [...agents.values()] });
        };
        publish();
        const timer = window.setInterval(publish, 1000);
        const unsubscribe = getApi().onNativeNotchFocus((blockId) => {
            void getApi().selectNativeHudWidget(blockId, true);
        });
        return () => {
            clearInterval(timer);
            offActivity();
            offSelection();
            unsubscribe();
            getApi().syncNativeNotch({ previews: [], agents: [] });
        };
    }, [enabled]);
}
