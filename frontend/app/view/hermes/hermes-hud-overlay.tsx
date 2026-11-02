import { HudComposerMoveEvent } from "@hermes/app/hud/composer-drag";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { TitlebarIcon } from "@hermes/app/shell/titlebar-icon";
import { Button } from "@hermes/components/ui/button";
import { Tip } from "@hermes/components/ui/tooltip";
import { $hudComposerPosition } from "@hermes/store/composer-position";
import { useStore } from "@nanostores/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./hermes-hud-overlay.css";
import type { HermesHudGeometry } from "./hermes-surface-controller";

export function HermesHudFrame({
    children,
    geometry,
    placement = "floating",
}: {
    children: ReactNode;
    geometry: HermesHudGeometry;
    placement?: "floating" | "bottom" | "top" | "shell";
}) {
    const frameRef = useRef<HTMLDivElement>(null);
    const [controlsTarget, setControlsTarget] = useState<HTMLElement>();
    useLayoutEffect(() => {
        const frame = frameRef.current;
        const update = () => setControlsTarget(frame.querySelector<HTMLElement>("[data-hud-island-controls-slot]"));
        update();
        const observer = new MutationObserver(update);
        observer.observe(frame, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);
    const edge = useStore($hudComposerPosition);
    const [detached, setDetached] = useState(false);
    const [islandPosition, setIslandPosition] = useState({ x: geometry.x, y: geometry.y });
    const drag = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
    useLayoutEffect(() => {
        if (!detached) return;
        const frame = frameRef.current;
        const onComposerMove = (event: Event) => {
            event.preventDefault();
            const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
            const bounds = frame.getBoundingClientRect();
            setIslandPosition((position) => ({
                x: Math.max(12, Math.min(window.innerWidth - bounds.width - 12, position.x + x)),
                y: Math.max(12, Math.min(window.innerHeight - bounds.height - 12, position.y + y)),
            }));
        };
        frame.addEventListener(HudComposerMoveEvent, onComposerMove);
        return () => frame.removeEventListener(HudComposerMoveEvent, onComposerMove);
    }, [detached]);
    const shell = placement === "shell" && !detached;
    return (
        <div
            ref={frameRef}
            aria-label="KronTerm Agent HUD"
            className={`pointer-events-none ${shell ? "absolute" : "fixed"} z-[115] overflow-visible`}
            data-kronterm-hermes-hud=""
            data-chat-placement={detached ? "island" : placement}
            data-hermes-frame-fit={shell ? "" : undefined}
            data-hermes-frame-edge={edge}
            style={
                detached
                    ? {
                          left: islandPosition.x,
                          top: islandPosition.y,
                          width: "min(580px, calc(100vw - 24px))",
                          height: "min(400px, calc(100dvh - 100px))",
                          zIndex: 6000,
                      }
                    : placement === "shell"
                      ? {
                            left: 0,
                            top: edge === "top" ? 0 : "auto",
                            bottom: edge === "bottom" ? 0 : undefined,
                            width: "100%",
                            height: "min(344px, calc(100dvh - 100px))",
                        }
                      : placement === "top"
                        ? {
                              left: "50%",
                              top: 64,
                              transform: "translateX(-50%)",
                              width: 680,
                              maxWidth: "calc(100vw - 24px)",
                              height: 520,
                              maxHeight: "calc(100vh - 80px)",
                          }
                        : placement === "bottom"
                          ? {
                                left: "50%",
                                bottom: 12,
                                transform: "translateX(-50%)",
                                width: 680,
                                maxWidth: "calc(100vw - 24px)",
                                height: 520,
                                maxHeight: "calc(100vh - 96px)",
                            }
                          : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }
            }
        >
            {controlsTarget &&
                createPortal(
                    <div
                        className="flex items-center gap-1"
                        data-hermes-island-handle=""
                        onPointerDown={(event) => {
                            if (event.button !== 0 || !(event.target as HTMLElement).closest("[data-hud-drag-handle]"))
                                return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (!detached) {
                                const bounds = frameRef.current.getBoundingClientRect();
                                setIslandPosition({ x: bounds.left, y: bounds.top });
                                setDetached(true);
                            }
                            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            const current = drag.current;
                            if (!current || current.pointerId !== event.pointerId) return;
                            const dx = event.clientX - current.x;
                            const dy = event.clientY - current.y;
                            current.x = event.clientX;
                            current.y = event.clientY;
                            setIslandPosition((position) => ({
                                x: Math.max(
                                    12,
                                    Math.min(
                                        window.innerWidth - Math.min(580, window.innerWidth - 24) - 12,
                                        position.x + dx
                                    )
                                ),
                                y: Math.max(
                                    64,
                                    Math.min(
                                        Math.max(64, window.innerHeight - Math.min(400, window.innerHeight - 100) - 12),
                                        position.y + dy
                                    )
                                ),
                            }));
                        }}
                        onPointerUp={(event) => {
                            drag.current = undefined;
                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                        }}
                        onLostPointerCapture={() => {
                            drag.current = undefined;
                        }}
                        onPointerCancel={() => {
                            drag.current = undefined;
                        }}
                    >
                        <Tip label="Drag to move chat">
                            <Button
                                aria-label="Drag to move chat"
                                data-hud-drag-handle=""
                                className="cursor-pointer touch-none active:cursor-grabbing"
                                size="icon-titlebar"
                                variant="ghost"
                                type="button"
                            >
                                <TitlebarIcon name="gripper" />
                            </Button>
                        </Tip>
                        {placement === "shell" && (
                            <Tip label={detached ? "Attach Hermes to OS frame" : "Detach Hermes as floating island"}>
                                <Button
                                    className="cursor-pointer"
                                    size="icon-titlebar"
                                    variant="ghost"
                                    type="button"
                                    aria-label={
                                        detached ? "Attach Hermes to OS frame" : "Detach Hermes as floating island"
                                    }
                                    onClick={() => {
                                        if (!detached)
                                            setIslandPosition({
                                                x: Math.max(12, (window.innerWidth - 580) / 2),
                                                y: Math.max(64, (window.innerHeight - 400) / 2),
                                            });
                                        setDetached(!detached);
                                    }}
                                >
                                    <TitlebarIcon name={detached ? "screen-normal" : "link-external"} />
                                </Button>
                            </Tip>
                        )}
                    </div>,
                    controlsTarget
                )}
            {children}
        </div>
    );
}

export function HermesHudOverlay({ children, targetId }: { children: ReactNode; targetId?: string }) {
    const [anchor, setAnchor] = useState<DOMRect>();
    const edge = useStore($hudComposerPosition);
    useLayoutEffect(() => {
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        const update = () => setAnchor(target.getBoundingClientRect());
        update();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
        observer?.observe(target);
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [targetId]);
    if (targetId && !anchor) return null;
    return createPortal(
        <div
            data-hermes-overlay-layer=""
            data-chat-edge={targetId ? edge : undefined}
            className={targetId ? "os-shell-chat" : undefined}
            style={
                targetId
                    ? {
                          position: "fixed",
                          left: anchor.left,
                          top: edge === "top" ? anchor.top : "auto",
                          bottom: edge === "bottom" ? 36 : undefined,
                          width: anchor.width,
                          height: anchor.height,
                          transform: "none",
                          zIndex: 4500,
                          overflow: "visible",
                          pointerEvents: "none",
                      }
                    : { position: "fixed", inset: 0, zIndex: 1100, pointerEvents: "none" }
            }
        >
            {children}
        </div>,
        document.body
    );
}
