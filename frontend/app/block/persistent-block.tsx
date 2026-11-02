// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemAppearanceContext, useSystemAppearance } from "@/app/components/system-ui/system-ui-context";
import { globalStore } from "@/app/store/jotaiStore";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import type { NodeModel } from "@/layout/lib/types";
import { cn } from "@/util/util";
import { atom, type PrimitiveAtom } from "jotai";
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type PointerEventHandler,
    type ReactNode,
    type WheelEventHandler,
} from "react";
import { Block } from "./block";
import { BlockChromeProvider, useBlockChrome, useBlockToolbarHost, type BlockChromeMode } from "./block-chrome-context";
import type { BlockProps } from "./blocktypes";
import { collectSurfaceOccluders, intersectSurfaceRects, makeSurfaceClipPath } from "./persistent-block-geometry";

export function makePersistentNodeModel(initial: NodeModel) {
    const binding = atom(initial) as PrimitiveAtom<NodeModel>;
    const model = { ...initial };
    for (const [key, value] of Object.entries(initial)) {
        if (value && typeof value === "object" && "read" in value) {
            model[key] = atom((get) => get(get(binding)[key]));
        } else if (typeof value === "function") {
            model[key] = (...args: unknown[]) => globalStore.get(binding)[key](...args);
        } else if (key !== "blockId") {
            Object.defineProperty(model, key, { enumerable: true, get: () => globalStore.get(binding)[key] });
        }
    }
    return { model, update: (next: NodeModel) => globalStore.set(binding, next) };
}

export type PersistentBlockSurfaceInput = {
    capturePointer?: boolean;
    onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
    onWheel?: WheelEventHandler<HTMLDivElement>;
};

type Entry = {
    id: string;
    binding: ReturnType<typeof makePersistentNodeModel>;
    slot?: HTMLElement;
    chrome: BlockChromeMode;
    toolbarHost?: HTMLElement;
    appearance: SystemAppearanceSnapshot;
    overlay?: ReactNode;
    surfaceInput?: PersistentBlockSurfaceInput;
};

function makeRegistry() {
    const entries = new Map<string, Entry>();
    const listeners = new Set<() => void>();
    let version = 0;
    return {
        entries,
        snapshot: () => version,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        changed: () => {
            version++;
            listeners.forEach((listener) => listener());
        },
    };
}

type Registry = ReturnType<typeof makeRegistry>;
const RegistryContext = createContext<Registry>(null);

function LiveBlock({ entry }: { entry: Entry }) {
    const host = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        let frame: number;
        let previous = "";
        let previousAppearance = "";
        let previousAppearanceProperties = new Map<string, string>();
        let previewWidth = 820;
        let previewHeight = 560;
        const position = () => {
            const element = host.current;
            const slot = entry.slot;
            if (!element) return;
            let visible = slot?.isConnected && slot.offsetWidth > 0 && slot.offsetHeight > 0;
            let zIndex = 0;
            let opacity = 1;
            for (
                let ancestor = slot?.parentElement;
                ancestor && ancestor !== element.parentElement?.parentElement;
                ancestor = ancestor.parentElement
            ) {
                const style = getComputedStyle(ancestor);
                zIndex = Math.max(zIndex, Number.parseInt(style.zIndex) || 0);
                opacity *= Number.parseFloat(style.opacity) || (style.opacity === "0" ? 0 : 1);
                if (style.visibility === "hidden" || style.display === "none") visible = false;
            }
            visible = visible && opacity > 0;
            const presentation = slot?.closest(".os-mode-root")
                ? "os"
                : slot?.closest(".workspace-canvas")
                  ? "canvas"
                  : slot?.closest(".widget-tabs-layout")
                    ? "tabs"
                    : "widgets";
            if (element.dataset.presentation !== presentation) element.dataset.presentation = presentation;

            const slotStyle = slot ? getComputedStyle(slot) : undefined;
            const rect = visible ? slot.getBoundingClientRect() : undefined;
            const rootRect = element.parentElement.getBoundingClientRect();
            let clipPath = "none";
            const osRoot = slot?.closest(".os-mode-root");
            const ownerWindow = slot?.closest<HTMLElement>(".os-window");
            const sceneRoot = osRoot ?? slot?.closest(".workspace-canvas");
            if (rect && sceneRoot) {
                let visibleRect = intersectSurfaceRects(rect, sceneRoot.getBoundingClientRect());
                for (
                    let ancestor = slot.parentElement;
                    ancestor && ancestor !== sceneRoot;
                    ancestor = ancestor.parentElement
                ) {
                    const style = getComputedStyle(ancestor);
                    if (
                        [style.overflow, style.overflowX, style.overflowY].some((value) =>
                            /hidden|clip|auto|scroll/.test(value)
                        )
                    ) {
                        visibleRect = intersectSurfaceRects(visibleRect, ancestor.getBoundingClientRect());
                    }
                }
                const occluders = collectSurfaceOccluders(sceneRoot, slot, ownerWindow, Boolean(osRoot));
                clipPath = makeSurfaceClipPath(rect, visibleRect, occluders, slot.offsetWidth, slot.offsetHeight);
            }
            // The live DOM stays in this plane; only its geometry follows the presentation slot.
            if (rect) {
                previewWidth = slot.offsetWidth;
                previewHeight = slot.offsetHeight;
            }
            const hud = kronTermHudController.getSnapshot();
            const hudPreview =
                document.visibilityState === "hidden" &&
                hud.active &&
                !hud.keepWorkspaceVisible &&
                hud.selectedBlockId === entry.id;
            const className = cn(
                presentation === "os" ? "os-window-surface" : "h-full w-full",
                hudPreview &&
                    "[&_.block-folded]:h-full! [&_.block-folded]:min-h-0! [&_.block-folded]:max-h-none! [&_.block-folded]:opacity-100! [&_.block-folded]:pointer-events-auto! [&_.block-folded]:transition-none!"
            );
            // Paint in the hidden owner without moving its OS slot or replacing the live mount.
            const previewCss = `position:absolute;pointer-events:auto;overflow:hidden;left:0;top:0;width:${Math.min(previewWidth, window.innerWidth)}px;height:${Math.min(previewHeight, window.innerHeight)}px;z-index:2147483647;opacity:1;visibility:visible`;
            const css = hudPreview
                ? previewCss
                : rect
                  ? `position:absolute;pointer-events:auto;overflow:hidden;left:${rect.x - rootRect.x}px;top:${rect.y - rootRect.y}px;width:${slot.offsetWidth}px;height:${slot.offsetHeight}px;transform-origin:top left;transform:scale(${rect.width / slot.offsetWidth},${rect.height / slot.offsetHeight});z-index:${zIndex};opacity:${opacity};clip-path:${clipPath};isolation:isolate`
                  : "display:none";
            const appearanceProperties = new Map<string, string>();
            if (slotStyle) {
                appearanceProperties.set("color", slotStyle.color);
                if (presentation === "os")
                    appearanceProperties.set("background-color", "var(--kt-content, var(--main-bg-color))");
                appearanceProperties.set("font", slotStyle.font);
                appearanceProperties.set("border-radius", getComputedStyle(slot.parentElement).borderRadius);
                for (let index = 0; index < slotStyle.length; index++) {
                    const property = slotStyle.item(index);
                    if (property.startsWith("--")) {
                        appearanceProperties.set(property, slotStyle.getPropertyValue(property));
                    }
                }
            }
            const appearanceKey = JSON.stringify([...appearanceProperties]);
            const geometryChanged = css !== previous;
            if (element.className !== className) element.className = className;
            if (geometryChanged) {
                element.style.cssText = css;
                previous = css;
            }
            // Replacing cssText clears inherited properties; restore them only when geometry or appearance changes.
            if (geometryChanged || appearanceKey !== previousAppearance) {
                for (const property of previousAppearanceProperties.keys()) {
                    if (!appearanceProperties.has(property)) element.style.removeProperty(property);
                }
                for (const [property, value] of appearanceProperties) element.style.setProperty(property, value);
                previousAppearanceProperties = appearanceProperties;
                previousAppearance = appearanceKey;
            }
        };
        const tick = () => {
            position();
            frame = requestAnimationFrame(tick);
        };
        tick();
        const unsubscribe = kronTermHudController.subscribe(position);
        document.addEventListener("visibilitychange", position);
        return () => {
            cancelAnimationFrame(frame);
            unsubscribe();
            document.removeEventListener("visibilitychange", position);
        };
    }, [entry]);
    return (
        <div
            ref={host}
            data-live-blockid={entry.id}
            className="h-full w-full"
            onPointerDownCapture={(event) => {
                entry.surfaceInput?.onPointerDownCapture?.(event);
                if (!event.defaultPrevented) entry.binding.model.focusNode();
            }}
            onWheel={(event) => {
                entry.surfaceInput?.onWheel?.(event);
                event.stopPropagation();
            }}
        >
            <SystemAppearanceContext.Provider value={entry.appearance}>
                <BlockChromeProvider mode={entry.chrome} toolbarHost={entry.toolbarHost}>
                    <Block nodeModel={entry.binding.model} preview={false} />
                    {entry.overlay}
                    {entry.surfaceInput?.capturePointer && (
                        <div
                            data-live-block-pan-capture=""
                            className="absolute inset-0 z-[2147483647] pointer-events-auto cursor-grab"
                            aria-hidden="true"
                        />
                    )}
                </BlockChromeProvider>
            </SystemAppearanceContext.Provider>
        </div>
    );
}

function LiveBlockLayer({ registry, blockIds }: { registry: Registry; blockIds: string[] }) {
    useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot);
    useEffect(() => {
        for (const id of registry.entries.keys()) if (!blockIds.includes(id)) registry.entries.delete(id);
    }, [blockIds, registry]);
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" data-live-block-layer="">
            {[...registry.entries.values()]
                .filter((entry) => blockIds.includes(entry.id))
                .map((entry) => (
                    <LiveBlock key={entry.id} entry={entry} />
                ))}
        </div>
    );
}

export function PersistentBlockProvider({ children, blockIds }: { children: ReactNode; blockIds: string[] }) {
    const [registry] = useState(makeRegistry);
    return (
        <RegistryContext.Provider value={registry}>
            {children}
            <LiveBlockLayer registry={registry} blockIds={blockIds} />
        </RegistryContext.Provider>
    );
}

export function PersistentBlock(
    props: BlockProps & { overlay?: ReactNode; surfaceInput?: PersistentBlockSurfaceInput }
) {
    const registry = useContext(RegistryContext);
    const chrome = useBlockChrome();
    const appearance = useSystemAppearance();
    const toolbarHost = useBlockToolbarHost();
    const slot = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!registry || props.preview) return;
        const id = props.nodeModel.blockId;
        let entry = registry.entries.get(id);
        if (!entry) {
            entry = { id, binding: makePersistentNodeModel(props.nodeModel), chrome, appearance };
            registry.entries.set(id, entry);
        }
        const owner = slot.current;
        entry.slot = owner;
        entry.binding.update(props.nodeModel);
        entry.chrome = chrome;
        entry.appearance = appearance;
        entry.toolbarHost = toolbarHost;
        entry.overlay = props.overlay;
        entry.surfaceInput = props.surfaceInput;
        registry.changed();
        return () => {
            if (entry.slot === owner) {
                entry.slot = undefined;
                registry.changed();
            }
        };
    }, [registry, props.nodeModel, props.preview, chrome, toolbarHost, appearance, props.overlay, props.surfaceInput]);
    if (!registry || props.preview)
        return (
            <>
                <Block {...props} />
                {props.overlay}
            </>
        );
    return <div ref={slot} data-block-slot={props.nodeModel.blockId} className="h-full w-full" />;
}
