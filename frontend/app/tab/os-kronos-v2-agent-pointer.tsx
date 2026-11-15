// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { subscribeAgentActivityStream } from "@/types/agent-activity";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./os-kronos-v2-agent-pointer.css";

import { KronOSV2AgentPointerEvent, type KronOSV2AgentPointerDetail } from "./os-kronos-v2-agent-pointer-event";

const PointerNames = ["Pip", "Miso", "Juniper", "Clover", "Luma", "Wren", "Pixel", "Fern", "Sol"];
const PointerColors = ["#49d9c9", "#ffadbe", "#b6a6ff", "#ffca79", "#86d6ff", "#b0e788", "#ffa88b"];
const PointerIdentityIdleMs = 15_000;

export function KronOSV2AgentPointer({ onFollow }: { onFollow: (point: KronOSV2AgentPointerDetail["point"]) => void }) {
    const follow = useRef(onFollow);
    follow.current = onFollow;
    const [typing, setTyping] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [pointer, setPointer] = useState<
        KronOSV2AgentPointerDetail & {
            label: string;
            color: string;
            sequence: number;
            anchor?: { root: HTMLElement; x: number; y: number };
        }
    >();
    useEffect(() => {
        let timer: number;
        let followTimer: number;
        let typingTimer: number;
        let sequence = 0;
        let nextIdentity = 0;
        let activeIdentity: { key?: string; index: number; lastSeen: number; namedRun: boolean } | undefined;
        const identities = new Map<string, { index: number; lastSeen: number }>();
        const identityFor = (key?: string, namedRun = false) => {
            const now = performance.now();
            if (!key && activeIdentity) {
                key = activeIdentity.key;
                namedRun = activeIdentity.namedRun;
            }
            const saved = key ? identities.get(key) : activeIdentity;
            const current = saved ?? (activeIdentity?.key == null ? activeIdentity : undefined);
            const index =
                current && ((namedRun && saved != null) || now - current.lastSeen < PointerIdentityIdleMs)
                    ? current.index
                    : nextIdentity++;
            activeIdentity = { key, index, lastSeen: now, namedRun };
            if (key) {
                identities.delete(key);
                identities.set(key, activeIdentity);
                if (identities.size > 64) identities.delete(identities.keys().next().value);
            }
            return {
                label: PointerNames[index % PointerNames.length],
                color: PointerColors[index % PointerColors.length],
            };
        };
        const exactPointerAt = new Map<string, number>();
        let pendingFollow: Pick<KronOSV2AgentPointerDetail, "blockId" | "action" | "point"> | undefined;
        const show = (detail: KronOSV2AgentPointerDetail, followPointer = true, identity = identityFor()) => {
            if (!detail || !Number.isFinite(detail.point.x) || !Number.isFinite(detail.point.y)) return;
            window.clearTimeout(timer);
            window.clearTimeout(followTimer);
            window.clearTimeout(typingTimer);
            setTyping(detail.action === "type");
            if (detail.action === "type") {
                typingTimer = window.setTimeout(() => setTyping(false), detail.typingDurationMs ?? 400);
            }
            const root = document.querySelector<HTMLElement>(`[data-live-blockid="${CSS.escape(detail.blockId)}"]`);
            const rect = root?.getBoundingClientRect();
            setOffset({ x: 0, y: 0 });
            setPointer({
                ...detail,
                ...identity,
                sequence: ++sequence,
                anchor: rect && root ? { root, x: rect.x, y: rect.y } : undefined,
            });
            if (followPointer) {
                followTimer = window.setTimeout(() => follow.current(detail.point), 140 + (detail.followDelayMs ?? 0));
            }
            const visibleFor = Math.max(2600, (detail.typingDurationMs ?? 0) + 250, (detail.followDelayMs ?? 0) + 500);
            timer = window.setTimeout(() => setPointer(undefined), visibleFor);
        };
        const unsubscribe = subscribeAgentActivityStream((activity) => {
            const blockId = activity.blockid;
            if (!blockId) return;
            if (
                activity.phase === "succeeded" &&
                pendingFollow?.blockId === blockId &&
                pendingFollow.action === activity.action
            ) {
                const { point } = pendingFollow;
                pendingFollow = undefined;
                followTimer = window.setTimeout(() => follow.current(point), 140);
                return;
            }
            if (activity.phase !== "running" && activity.phase !== "verifying") return;
            if (!["click", "doubleClick", "scroll", "drag", "move", "type"].includes(activity.action)) return;
            const identity = identityFor(activity.runid ?? activity.sessionid, activity.runid != null);
            if (performance.now() - (exactPointerAt.get(blockId) ?? -Infinity) < 1800) return;
            const root = document.querySelector<HTMLElement>(`[data-live-blockid="${CSS.escape(blockId)}"]`);
            if (!root) return;
            const surface =
                activity.surface === "browser" ? (root.querySelector<HTMLElement>("webview") ?? root) : root;
            const rect = surface.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const point = activity.point;
            const x =
                point && Number.isFinite(point.x) && surface.clientWidth > 0
                    ? rect.x + Math.max(0, Math.min(1, point.x / surface.clientWidth)) * rect.width
                    : rect.x + rect.width / 2;
            const y =
                point && Number.isFinite(point.y) && surface.clientHeight > 0
                    ? rect.y + Math.max(0, Math.min(1, point.y / surface.clientHeight)) * rect.height
                    : rect.y + rect.height / 2;
            pendingFollow = { blockId, action: activity.action, point: { x, y } };
            show(
                {
                    blockId,
                    action: activity.action,
                    point: { x, y },
                    target: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                },
                false,
                identity
            );
        });
        const move = (event: Event) => {
            const detail = (event as CustomEvent<KronOSV2AgentPointerDetail>).detail;
            if (!detail) return;
            pendingFollow = undefined;
            exactPointerAt.set(detail.blockId, performance.now());
            show(detail);
        };
        window.addEventListener(KronOSV2AgentPointerEvent, move);
        return () => {
            window.clearTimeout(timer);
            window.clearTimeout(followTimer);
            window.clearTimeout(typingTimer);
            window.removeEventListener(KronOSV2AgentPointerEvent, move);
            unsubscribe();
        };
    }, []);
    useEffect(() => {
        const anchor = pointer?.anchor;
        if (!anchor) return;
        let frame: number;
        let previousX = 0;
        let previousY = 0;
        const sync = () => {
            const rect = anchor.root.getBoundingClientRect();
            const x = rect.x - anchor.x;
            const y = rect.y - anchor.y;
            if (rect.width && rect.height && (x !== previousX || y !== previousY)) {
                previousX = x;
                previousY = y;
                setOffset({ x, y });
            }
            frame = requestAnimationFrame(sync);
        };
        frame = requestAnimationFrame(sync);
        return () => cancelAnimationFrame(frame);
    }, [pointer]);
    if (!pointer) return null;
    const { point, target, action, label, color, sequence } = pointer;
    const x = Math.max(3, Math.min(window.innerWidth - 25, point.x + offset.x));
    const y = Math.max(3, Math.min(window.innerHeight - 29, point.y + offset.y));
    const scrolling = action === "scroll" || action === "scroll-to";
    const status = typing ? "..." : scrolling ? `Scrolling (${pointer.scrollAxis ?? "y"})` : undefined;
    return createPortal(
        <div
            className="kronos-v2-agent-indicator"
            aria-hidden="true"
            data-scrolling={scrolling || undefined}
            style={{ "--agent-indicator-color": color } as CSSProperties}
        >
            {target && (
                <div
                    key={`highlight-${sequence}`}
                    className="kronos-v2-agent-highlight"
                    style={{
                        left: target.x + offset.x,
                        top: target.y + offset.y,
                        width: target.width,
                        height: target.height,
                    }}
                />
            )}
            <div className="kronos-v2-agent-pointer" style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}>
                {action !== "type" && <span key={sequence} className="kronos-v2-agent-action" />}
                <svg width="25" height="29" viewBox="0 0 19 22" aria-hidden="true">
                    <path d="M2 2 16.5 10 10.2 11.2 7.2 18.6 2 2Z" />
                </svg>
                <span
                    className="kronos-v2-agent-name"
                    data-flip={x > innerWidth - 172 || undefined}
                    data-flip-up={y > innerHeight - 69 || undefined}
                >
                    {label}
                    {status && <span className="kronos-v2-agent-status">{status}</span>}
                </span>
            </div>
        </div>,
        document.body
    );
}
