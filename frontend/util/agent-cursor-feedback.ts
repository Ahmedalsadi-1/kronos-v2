// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Fog and press metrics adapted from iFurySt/open-codex-computer-use.
// Copyright (c) 2026 Leo. MIT: THIRD_PARTY_NOTICES/computer-cursor-motion.txt.
import { type CursorPoint } from "./computer-cursor-motion";

export function sampleAgentParticle(
    x: number,
    y: number,
    now: number,
    ripples: { point: CursorPoint; at: number }[],
    surface = { width: 800, height: 600 }
) {
    const time = now / 1000;
    const sourceX = surface.width * (0.5 + 0.09 * Math.sin(time * 0.43));
    const sourceY = surface.height + 100;
    const dx = x - sourceX,
        dy = y - sourceY;
    const distance = Math.hypot(dx, dy);
    const bend =
        22 * Math.sin(x * 0.013 + y * 0.007 + time * 0.67) + 15 * Math.sin(x * 0.024 - y * 0.011 - time * 0.41);
    const phase = (distance + bend) * 0.037 - time * 7;
    const attenuation = Math.exp(-Math.max(0, distance - 100) / Math.max(1, surface.height * 1.1));
    const swell = Math.sin(phase) + 0.38 * Math.sin(phase * 1.63 + x * 0.009 + time * 0.31);
    const shear = Math.cos(phase * 0.73 + y * 0.016 - time * 0.38);
    let offsetX = ((dx / Math.max(distance, 1)) * swell * 32 + shear * 12) * attenuation;
    let offsetY = (dy / Math.max(distance, 1)) * swell * 43 * attenuation;
    let light = (0.28 + 0.48 * Math.max(0, Math.cos(phase))) * attenuation;
    for (const ripple of ripples) {
        const age = now - ripple.at;
        if (age < 0 || age >= 1400) continue;
        // Advect the disturbance through the moving surface so clicks bend the existing current.
        const rx = x + offsetX * 0.6 - ripple.point.x;
        const ry = y + offsetY * 0.6 - ripple.point.y;
        const radius = Math.hypot(rx, ry);
        const angle = Math.atan2(ry, rx);
        const crest = radius - (8 + age * 0.2) + Math.sin(angle * 3 + time * 1.7) * 9 + Math.sin(angle * 5 - time) * 5;
        const envelope = Math.exp(-((crest / 34) ** 2)) * (1 - age / 1400);
        const displacement = Math.cos(crest * 0.11) * envelope * 32;
        const curl = Math.sin(crest * 0.075 + angle * 2) * envelope * 14;
        offsetX += (rx * displacement - ry * curl) / Math.max(radius, 1);
        offsetY += (ry * displacement + rx * curl) / Math.max(radius, 1);
        light += envelope * 0.9;
    }
    return { x: x + offsetX, y: y + offsetY, alpha: Math.min(1, 0.45 + light) };
}

export function drawAgentCursor(
    ctx: CanvasRenderingContext2D,
    point: CursorPoint,
    clickAge: number,
    label: string,
    reducedMotion = false
) {
    ctx.save();
    ctx.translate(point.x, point.y);
    const pulse = !reducedMotion && clickAge >= 0 && clickAge < 320 ? Math.sin((clickAge / 320) * Math.PI) : 0;
    const fog = ctx.createRadialGradient(5, 10, 0, 5, 10, 25 + pulse * 3);
    fog.addColorStop(0, "rgba(242,128,166,0.26)");
    fog.addColorStop(0.5, "rgba(232,133,185,0.12)");
    fog.addColorStop(0.82, "rgba(222,148,201,0.04)");
    fog.addColorStop(1, "rgba(242,148,185,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(-40, -30, 90, 90);
    if (pulse > 0) {
        const hues = ["244,143,168", "232,156,201", "211,164,220"];
        hues.forEach((hue, index) => {
            const angle = (index / hues.length) * Math.PI * 2;
            const x = Math.cos(angle) * 9;
            const y = Math.sin(angle) * 9;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, 27);
            glow.addColorStop(0, `rgba(${hue},${pulse * 0.2})`);
            glow.addColorStop(1, `rgba(${hue},0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(x - 27, y - 27, 54, 54);
        });
    }
    ctx.save();
    ctx.scale(1 - pulse * 0.12, 1 - pulse * 0.08);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(1.2, 2.4);
    ctx.quadraticCurveTo(0.4, 0.1, 2.5, 1.5);
    ctx.lineTo(17.4, 11.2);
    ctx.quadraticCurveTo(19, 12.6, 16.8, 13);
    ctx.lineTo(11.7, 13.6);
    ctx.quadraticCurveTo(10.5, 13.8, 10, 14.9);
    ctx.lineTo(7.1, 21);
    ctx.quadraticCurveTo(6.1, 22.8, 5.5, 20.5);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(241,117,158,0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 1;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
    if (label) {
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
        const transform = ctx.getTransform();
        const viewport = ctx.canvas.width / (transform.a || 1);
        const viewportHeight = ctx.canvas.height / (transform.d || transform.a || 1);
        let text = label.slice(0, 60);
        const maxWidth = Math.max(0, viewport - 26);
        while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -1);
        const width = Math.min(viewport - 8, ctx.measureText(text).width + 18);
        const left = Math.max(4 - point.x, Math.min(12, viewport - point.x - width - 4));
        const top = Math.max(4 - point.y, Math.min(16, viewportHeight - point.y - 32));
        ctx.beginPath();
        ctx.roundRect(left, top, width, 28, 14);
        ctx.fillStyle = "rgba(40,43,48,0.94)";
        ctx.shadowColor = "rgba(20,28,42,0.22)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
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
    onPosition?: (point: CursorPoint) => void,
    sampleParticle = sampleAgentParticle,
    surfaceEffects = true
) {
    const canvas = document.createElement("canvas");
    const aura = document.createElement("div");
    const style = document.createElement("style");
    aura.className = "kron-agent-content-aura";
    aura.setAttribute("aria-hidden", "true");
    aura.hidden = true;
    style.textContent = `
        .kron-agent-content-aura { position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none;
            background:rgba(171,145,212,.12);
            box-shadow:inset 0 0 38px rgba(199,142,218,.22); }
        .kron-agent-content-aura::before { content:''; position:absolute; inset:-3px; border-radius:inherit;
            background:radial-gradient(ellipse at 15% 0%,rgba(219,149,217,.9),transparent 65%),
                radial-gradient(ellipse at 100% 65%,rgba(144,164,233,.8),transparent 60%),
                radial-gradient(ellipse at 35% 100%,rgba(196,157,225,.8),transparent 65%);
            background-size:250% 250%; mask-image:linear-gradient(to bottom,#000,transparent 80px,transparent calc(100% - 80px),#000),
                linear-gradient(to right,#000,transparent 80px,transparent calc(100% - 80px),#000);
            mask-composite:add; opacity:.35; animation:kron-agent-aura-drift 8s ease-in-out infinite; }
        @keyframes kron-agent-aura-drift { 0%,100% { background-position:0% 45%; opacity:.55; }
            50% { background-position:100% 55%; opacity:.66; } }
        .kron-agent-content-aura[data-reduced-motion]::before { animation:none; }
        @media(prefers-reduced-motion:reduce) { .kron-agent-content-aura::before { animation:none; } }
    `;
    host.append(style, aura);
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
    let lastPaint = -Infinity;
    let clickAt = -Infinity;
    let pendingClick = false;
    let ripples: { point: CursorPoint; at: number }[] = [];
    let label = "";
    let reduced = media.matches;
    let destroyed = false;
    const clear = () => {
        if (frame != null) cancelAnimationFrame(frame);
        frame = undefined;
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        aura.hidden = true;
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
        if (!reduced && !pendingClick && now - lastPaint < 32) {
            frame = requestAnimationFrame(render);
            return;
        }
        lastPaint = now;
        if (!moving) {
            point = { ...target };
            velocity = { x: 0, y: 0 };
            if (pendingClick) {
                clickAt = now;
                pendingClick = false;
                if (!reduced && surfaceEffects) ripples = [...ripples.slice(-3), { point: { ...target }, at: now }];
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
        ripples = reduced ? [] : ripples.filter((ripple) => now - ripple.at < 1400);
        if (surfaceEffects) {
            const spacing = Math.max(2.5, Math.ceil(Math.sqrt((width * height) / 50000)));
            const surface = { width, height };
            ctx.save();
            const bands: { x: number; y: number }[][] = Array.from({ length: 8 }, () => []);
            for (let y = 4; y < height; y += spacing) {
                for (let x = 4; x < width; x += spacing) {
                    const particle = sampleParticle(x, y, reduced ? 0 : now, ripples, surface);
                    bands[Math.min(7, Math.floor(particle.alpha * 8))].push(particle);
                }
            }
            for (const [index, particles] of bands.entries()) {
                if (!particles.length) continue;
                ctx.globalAlpha = (index + 1) / 8;
                ctx.fillStyle = "rgba(196,167,228,0.38)";
                ctx.beginPath();
                for (const particle of particles) ctx.rect(particle.x - 0.5, particle.y - 0.5, 2.7, 2.7);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                for (const particle of particles) ctx.rect(particle.x, particle.y, 1.8, 1.8);
                ctx.fill();
            }
            ctx.restore();
            for (const ripple of ripples) {
                const progress = Math.max(0, (now - ripple.at) / 1400);
                const radius = 8 + (now - ripple.at) * 0.2;
                const opacity = (1 - progress) ** 2;
                ctx.save();
                ctx.translate(ripple.point.x, ripple.point.y);
                const hue = ctx.createRadialGradient(0, 0, radius * 0.65, 0, 0, radius + 12);
                hue.addColorStop(0, "rgba(140,166,213,0)");
                hue.addColorStop(0.65, `rgba(199,155,222,${opacity * 0.15})`);
                hue.addColorStop(1, "rgba(170,164,205,0)");
                ctx.fillStyle = hue;
                ctx.fillRect(-radius - 12, -radius - 12, (radius + 12) * 2, (radius + 12) * 2);
                ctx.beginPath();
                for (let segment = 0; segment <= 80; segment++) {
                    const angle = (segment / 80) * Math.PI * 2;
                    const bentRadius =
                        radius + Math.sin(angle * 3 + now * 0.0017) * 9 + Math.sin(angle * 5 - now * 0.001) * 5;
                    const px = Math.cos(angle) * bentRadius,
                        py = Math.sin(angle) * bentRadius;
                    if (segment === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.strokeStyle = `rgba(211,177,234,${opacity * 0.38})`;
                ctx.lineWidth = 1;
                ctx.stroke();
                for (let index = 0; index < 16; index++) {
                    const angle = index * 2.39996;
                    const distance = radius + Math.sin(index * 4.1) * 10;
                    const size = index % 3 === 0 ? 1.5 : 0.8;
                    ctx.fillStyle = `rgba(188,204,234,${opacity * (0.3 + (index % 3) * 0.15)})`;
                    ctx.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, size, size);
                }
                ctx.restore();
            }
        }
        draw(ctx, point, now - clickAt, label, reduced);
        onPosition?.(point);
        if ((!reduced && surfaceEffects) || moving || ripples.length || (!reduced && now - clickAt < 320))
            frame = requestAnimationFrame(render);
    };
    return {
        update(next: CursorPoint, nextLabel = "", click = false, reduce = media.matches) {
            if (destroyed || !ctx || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
            target = { ...next };
            aura.hidden = !surfaceEffects;
            aura.toggleAttribute("data-reduced-motion", reduce);
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
            ripples = [];
            lastPaint = -Infinity;
        },
        destroy() {
            destroyed = true;
            clear();
            canvas.remove();
            aura.remove();
            style.remove();
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
        const cursor = (${mountAgentCursor.toString()})(host, ${drawAgentCursor.toString()}, ${advanceAgentCursor.toString()}, undefined, ${sampleAgentParticle.toString()});
        let enabled = false;
        window.__showKronCursor = show => { enabled = !!show; if (!enabled) cursor.clear(); };
        window.__updateKronCursor = (point, label, click, reducedMotion) => { if (enabled) cursor.update(point, label, click, reducedMotion); };
    })()`;
}
