// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
    return (
        <div
            aria-label="KronTerm Agent HUD"
            className={`pointer-events-none ${placement === "shell" ? "absolute" : "fixed"} z-[115] overflow-visible`}
            data-kronterm-hermes-hud=""
            data-chat-placement={placement}
            style={
                placement === "shell"
                    ? { left: 0, top: 0, width: "100%", height: "min(400px, calc(100dvh - 64px))" }
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
            {children}
        </div>
    );
}

export function HermesHudOverlay({ children, targetId }: { children: ReactNode; targetId?: string }) {
    const [anchor, setAnchor] = useState<DOMRect>();
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
            className={targetId ? "os-shell-chat" : undefined}
            style={
                targetId
                    ? {
                          position: "fixed",
                          left: anchor.left,
                          top: anchor.top,
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
