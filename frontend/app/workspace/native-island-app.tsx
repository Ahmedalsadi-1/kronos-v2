// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { NativeAgentProgress } from "./native-agent-progress";
import { useNativeNotchPreview } from "./use-native-notch-preview";

import { Block as BlockView } from "@/app/block/block";
import { BlockChromeProvider } from "@/app/block/block-chrome-context";
import { blockViewToName } from "@/app/block/blockutil";
import { SystemUIProvider } from "@/app/components/system-ui";
import { globalStore } from "@/app/store/jotaiStore";
import { getTabModelByTabId, TabModelContext } from "@/app/store/tab-model";
import * as WOS from "@/app/store/wos";
import { OSWebNavBar } from "@/app/tab/os-web-navbar";
import "@/app/tab/os-workspace.scss";
import { AgentControlIndicator, useAgentPresenceForBlock } from "@/app/view/agent-control-indicator";
import { requestAgentTakeover } from "@/app/view/hermes/hermes-tool-activity";
import { WaveEnv, WaveEnvContext } from "@/app/waveenv/waveenv";
import { makeWaveEnvImpl } from "@/app/waveenv/waveenvimpl";
import type { NodeModel } from "@/layout/lib/types";
import { atoms, getApi } from "@/store/global";
import { getFileTreeDndManager } from "@hermes/app/right-sidebar/files/dnd-manager";
import { atom, Provider, useAtomValue } from "jotai";
import { Hand, Maximize2, Minimize2, X } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import "./native-island-chrome.css";

function makeNativeIslandNodeModel(blockId: string): NodeModel {
    return {
        additionalProps: atom({}),
        innerRect: atom({}),
        blockNum: atom(1),
        numLeafs: atom(1),
        nodeId: `native-island-${blockId}`,
        blockId,
        addEphemeralNodeToLayout: () => {},
        animationTimeS: atom(0),
        isResizing: atom(false),
        isFocused: atom(true),
        isMagnified: atom(false),
        isFolded: atom(false),
        anyMagnified: atom(false),
        isEphemeral: atom(false),
        ready: atom(true),
        disablePointerEvents: atom(false),
        toggleMagnify: () => {},
        toggleFold: () => {},
        focusNode: () => {},
        onClose: () => getApi().closeNativeHudSurface(),
        dragHandleRef: undefined,
        displayContainerRef: undefined,
    } as unknown as NodeModel;
}

export function NativeIslandProviders({ children, tabId }: { children: ReactNode; tabId: string }) {
    const waveEnvRef = useRef<WaveEnv>(null);
    if (waveEnvRef.current == null) waveEnvRef.current = makeWaveEnvImpl();
    const tabModel = useMemo(() => getTabModelByTabId(tabId, waveEnvRef.current), [tabId]);

    return (
        <Provider store={globalStore}>
            <WaveEnvContext.Provider value={waveEnvRef.current}>
                <TabModelContext.Provider value={tabModel}>
                    <DndProvider manager={getFileTreeDndManager()}>{children}</DndProvider>
                </TabModelContext.Provider>
            </WaveEnvContext.Provider>
        </Provider>
    );
}

function useIslandPresentation() {
    const [presentation, setPresentation] = useState<"docked" | "detached">();
    useEffect(() => {
        let active = true;
        const update = (next: "docked" | "detached") => {
            if (active && next) setPresentation(next);
        };
        const off = getApi().onNativeHudIslandPresentation(update);
        void getApi()
            .getNativeHudIslandPresentation()
            .then(update)
            .catch(() => {});
        return () => {
            active = false;
            off();
        };
    }, []);
    return [presentation, setPresentation] as const;
}

function IslandControls({ title, agentActive }: { title: string; agentActive: boolean }) {
    const [presentation, setPresentation] = useIslandPresentation();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    if (presentation !== "detached") return null;
    return (
        <div
            className="native-island-controls relative flex shrink-0 items-center gap-1 p-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
            {agentActive && (
                <button
                    type="button"
                    className="native-island-control grid size-9 cursor-pointer place-items-center rounded-md"
                    aria-label="Take over from agent"
                    title="Take over"
                    onClick={() => requestAgentTakeover()}
                >
                    <Hand size={16} />
                </button>
            )}
            <button
                type="button"
                className="native-island-control grid size-9 cursor-pointer place-items-center rounded-md"
                aria-label={presentation === "detached" ? "Restore preview to notch" : "Enlarge preview"}
                title={presentation === "detached" ? "Restore to notch" : "Enlarge preview"}
                disabled={pending}
                onClick={() => {
                    setPending(true);
                    void getApi()
                        .toggleNativeHudIslandExpanded()
                        .then((next) => {
                            if (!next) throw new Error("Could not change preview size");
                            setPresentation(next);
                            setError("");
                        })
                        .catch((e) => setError(e.message))
                        .finally(() => setPending(false));
                }}
            >
                {presentation === "detached" ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            {error && (
                <p
                    role="alert"
                    className="native-island-error absolute right-0 top-full z-50 mt-2 w-48 rounded-lg p-2 text-xs"
                >
                    {error}
                </p>
            )}
            <button
                type="button"
                className="native-island-control grid size-9 cursor-pointer place-items-center rounded-md"
                aria-label={`Hide ${title} island`}
                title="Hide island"
                onClick={() => getApi().closeNativeHudSurface()}
            >
                <X size={16} />
            </button>
            <span
                aria-hidden="true"
                className="h-7 w-5 shrink-0"
                style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            />
        </div>
    );
}

function NativeIslandContent({ blockId, onReady }: { blockId: string; onReady: () => void }) {
    useNativeNotchPreview(true);
    const [presentation] = useIslandPresentation();
    const docked = presentation !== "detached";
    const blockAtom = useMemo(() => WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)), [blockId]);
    const block = useAtomValue(blockAtom);
    const config = useAtomValue(atoms.fullConfigAtom);
    const nodeModel = useMemo(() => makeNativeIslandNodeModel(blockId), [blockId]);
    const view = String(block?.meta?.view ?? "term");
    const title = String(block?.meta?.["frame:title"] ?? "").trim() || blockViewToName(view);
    const agentPresence = useAgentPresenceForBlock(blockId, view);

    useEffect(() => {
        document.documentElement.toggleAttribute("data-kronterm-browser-tool-owner", view === "web");
        window.dispatchEvent(new Event("kronterm-browser-tool-owner"));
        return () => {
            document.documentElement.removeAttribute("data-kronterm-browser-tool-owner");
            window.dispatchEvent(new Event("kronterm-browser-tool-owner"));
        };
    }, [view]);

    useEffect(() => {
        globalStore.set(nodeModel.isFocused as any, true);
        onReady();
    }, [nodeModel, onReady]);

    return (
        <main
            data-island-presentation={docked ? "docked" : "detached"}
            style={docked ? { border: 0, borderRadius: 0, boxShadow: "none" } : undefined}
            data-reduced-motion={config?.settings?.["window:reducedmotion"] === true}
            className="native-island-shell relative flex h-screen w-screen flex-col overflow-hidden border"
        >
            {view === "web" ? (
                <OSWebNavBar
                    blockId={blockId}
                    nativeHeader={docked}
                    islandControls={<IslandControls title={title} agentActive={Boolean(agentPresence)} />}
                />
            ) : (
                <div className="native-island-titlebar" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
                    <strong>{title}</strong>
                    <div>
                        <IslandControls title={title} agentActive={Boolean(agentPresence)} />
                    </div>
                </div>
            )}
            {view === "term" && <NativeAgentProgress blockId={blockId} />}
            <section
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
                style={{ borderRadius: docked ? 0 : "0 0 14px 14px" }}
            >
                <BlockChromeProvider mode="integrated">
                    <BlockView nodeModel={nodeModel} preview={false} />
                </BlockChromeProvider>
                <AgentControlIndicator presence={agentPresence} />
            </section>
        </main>
    );
}

export function NativeIslandApp({ blockId, tabId, onReady }: { blockId: string; tabId: string; onReady: () => void }) {
    return (
        <NativeIslandProviders tabId={tabId}>
            <SystemUIProvider>
                <NativeIslandContent blockId={blockId} onReady={onReady} />
            </SystemUIProvider>
        </NativeIslandProviders>
    );
}
