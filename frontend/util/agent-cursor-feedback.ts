// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Fog and press metrics adapted from iFurySt/open-codex-computer-use.
// Copyright (c) 2026 Leo. MIT: THIRD_PARTY_NOTICES/computer-cursor-motion.txt.
import { type CursorPoint } from "./computer-cursor-motion";

export function drawAgentCursor(
    ctx: CanvasRenderingContext2D,
    point: CursorPoint,
    clickAge: number,
    label: string,
    reducedMotion = false
) {
    ctx.save();
    ctx.translate(point.x, point.y);
    const pulse = !reducedMotion && clickAge >= 0 && clickAge < 160 ? Math.sin((clickAge / 160) * Math.PI) : 0;
    const fog = ctx.createRadialGradient(5, 12, 0, 5, 12, 33 + pulse * 1.2);
    fog.addColorStop(0, "rgba(97,92,89,0.30)");
    fog.addColorStop(0.5, "rgba(110,105,102,0.18)");
    fog.addColorStop(0.82, "rgba(117,112,110,0.07)");
    fog.addColorStop(1, "rgba(153,153,153,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(-40, -30, 90, 90);
    ctx.save();
    ctx.scale(1 - pulse * 0.04, 1 + pulse * 0.02);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(20, 15);
    ctx.lineTo(12, 16);
    ctx.lineTo(8, 25);
    ctx.lineTo(5, 23);
    ctx.lineTo(9, 15);
    ctx.lineTo(1, 16);
    ctx.closePath();
    ctx.fillStyle = "#615c59";
    ctx.fill();
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    if (label) {
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
        const text = label.slice(0, 60);
        const width = ctx.measureText(text).width + 18;
        const viewport = ctx.canvas.width / (ctx.getTransform().a || 1);
        const left = Math.min(22, viewport - point.x - width - 4);
        const top = 18;
        ctx.beginPath();
        ctx.roundRect(left, top, width, 28, 14);
        ctx.fillStyle = "rgba(49,49,49,0.92)";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(text, left + 9, top + 18);
    }
    ctx.restore();
}

export function advanceAgentCursor(point: CursorPoint, target: CursorPoint, velocity: CursorPoint, dt: number) {
    const omega = 18;
    const decay = Math.exp(-omega * dt);
    const next = { x: point.x, y: point.y };
    const speed = { x: velocity.x, y: velocity.y };
    for (const axis of ["x", "y"] as const) {
        const offset = point[axis] - target[axis];
        const coefficient = velocity[axis] + omega * offset;
        next[axis] = target[axis] + (offset + coefficient * dt) * decay;
        speed[axis] = (velocity[axis] - omega * coefficient * dt) * decay;
    }
    return { point: next, velocity: speed };
}

export function mountAgentCursor(
    host: HTMLElement,
    draw = drawAgentCursor,
    advance = advanceAgentCursor,
    onPosition?: (point: CursorPoint) => void
) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.agentCursor = "";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let point: CursorPoint, target: CursorPoint;
    let velocity = { x: 0, y: 0 };
    let frame: number;
    let lastTime = 0;
    let clickAt = -Infinity;
    let pendingClick = false;
    let label = "";
    let reduced = media.matches;
    let destroyed = false;
    const clear = () => {
        if (frame != null) cancelAnimationFrame(frame);
        frame = undefined;
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
    const render = (now: number) => {
        frame = undefined;
        if (!ctx || destroyed || !target) return;
        const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
        lastTime = now;
        if (reduced) {
            point = { ...target };
            velocity = { x: 0, y: 0 };
        } else {
            const next = advance(point, target, velocity, dt);
            point = next.point;
            velocity = next.velocity;
        }
        const moving =
            Math.hypot(point.x - target.x, point.y - target.y) > 0.1 || Math.hypot(velocity.x, velocity.y) > 0.5;
        if (!moving) {
            point = { ...target };
            velocity = { x: 0, y: 0 };
            if (pendingClick) {
                clickAt = now;
                pendingClick = false;
            }
        }
        const width = host.clientWidth,
            height = host.clientHeight,
            dpr = devicePixelRatio || 1;
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        draw(ctx, point, now - clickAt, label, reduced);
        onPosition?.(point);
        if (moving || now - clickAt < 160) frame = requestAnimationFrame(render);
    };
    return {
        update(next: CursorPoint, nextLabel = "", click = false, reduce = media.matches) {
            if (destroyed || !ctx || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
            target = { ...next };
            point ??= { ...target };
            label = nextLabel;
            reduced = reduce;
            if (click) pendingClick = true;
            if (frame == null) {
                lastTime = performance.now();
                render(lastTime);
            }
        },
        clear() {
            clear();
            point = target = undefined;
            velocity = { x: 0, y: 0 };
            clickAt = -Infinity;
            pendingClick = false;
        },
        destroy() {
            destroyed = true;
            clear();
            canvas.remove();
        },
    };
}

export function injectedAgentCursorScript(): string {
    return `(() => {
        if (window.__kronCursorInjected) return;
        window.__kronCursorInjected = true;
        const host = document.createElement('div');
        host.id = '__kron-cursor-ring';
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        document.documentElement.appendChild(host);
        const cursor = (${mountAgentCursor.toString()})(host, ${drawAgentCursor.toString()}, ${advanceAgentCursor.toString()});
        let enabled = false;
        window.__showKronCursor = show => { enabled = !!show; if (!enabled) cursor.clear(); };
        window.__updateKronCursor = (point, label, click) => { if (enabled) cursor.update(point, label, click); };
    })()`;
}
