// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Mochi Bot Engine - Ported from Coucou's Swift BotEngine
 * Renders the Mochi character on a canvas with full animation support
 */

export type EyeShape =
    | "pill"
    | "wide"
    | "dot"
    | "line"
    | "flat"
    | "happy"
    | "closed"
    | "spiral"
    | "heart"
    | "star"
    | "tired"
    | "wink";

export type BadgeType = "dots" | "bang" | "question" | "dot";

export type BotState =
    | "idle"
    | "working"
    | "thinking"
    | "searching"
    | "approval"
    | "question"
    | "error"
    | "finished"
    | "ratelimit"
    | "sleeping"
    | "dizzy";

export type BotEmote = "love" | "surprised" | "proud" | "wink" | "yawn" | "happy" | "annoyed";

type TweenKey = { target: number; duration: number; ease: (t: number) => number };
type Tween = {
    property: string;
    keys: TweenKey[];
    keyIndex: number;
    from: number;
    startTime: number;
    onComplete?: () => void;
};

type ParticleType = "heart" | "star" | "spark" | "sweat" | "z";
type Particle = {
    type: ParticleType;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    rot: number;
    size: number;
};

type BotStateCfg = {
    color: [number, number, number];
    tint: number;
    eye: EyeShape;
    badge: BadgeType | null;
    badgeColor: [number, number, number];
    glow: [number, number, number];
    glowOpacity: number;
    bounces: boolean;
    scans: boolean;
    breathes: boolean;
    zz: boolean;
    sweat: boolean;
    look: { x: number; y: number } | null;
    tilt: number;
};

const E = {
    out: (t: number): number => 1 - Math.pow(1 - t, 3),
    inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t: number): number => {
        const c1 = 1.7;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    lin: (t: number): number => t,
};

const MOCHI_CONST = {
    eyeW: 0.25,
    eyeH: 0.27,
    eyeSp: 0.37,
    eyeP: -0.12,
    baseTop: [237, 237, 239],
    baseBottom: [196, 197, 202],
    ink: [26, 20, 18],
};

const BOT_STATES: Record<BotState, BotStateCfg> = {
    idle: {
        color: [230, 233, 238],
        tint: 0,
        eye: "pill",
        badge: null,
        badgeColor: [255, 255, 255],
        glow: [255, 255, 255],
        glowOpacity: 0.25,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    working: {
        color: [59, 158, 255],
        tint: 0.72,
        eye: "pill",
        badge: "dots",
        badgeColor: [59, 158, 255],
        glow: [59, 158, 255],
        glowOpacity: 0.55,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    thinking: {
        color: [139, 92, 246],
        tint: 0.72,
        eye: "pill",
        badge: "dots",
        badgeColor: [139, 92, 246],
        glow: [139, 92, 246],
        glowOpacity: 0.5,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: { x: 0.55, y: 0.55 },
        tilt: 0,
    },
    searching: {
        color: [99, 102, 241],
        tint: 0.72,
        eye: "pill",
        badge: "dots",
        badgeColor: [99, 102, 241],
        glow: [99, 102, 241],
        glowOpacity: 0.55,
        bounces: false,
        scans: true,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    approval: {
        color: [245, 165, 36],
        tint: 0.78,
        eye: "wide",
        badge: "bang",
        badgeColor: [245, 165, 36],
        glow: [245, 165, 36],
        glowOpacity: 0.6,
        bounces: true,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    question: {
        color: [34, 211, 238],
        tint: 0.75,
        eye: "pill",
        badge: "question",
        badgeColor: [34, 211, 238],
        glow: [34, 211, 238],
        glowOpacity: 0.55,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0.17,
    },
    error: {
        color: [244, 80, 94],
        tint: 0.78,
        eye: "flat",
        badge: "dot",
        badgeColor: [244, 80, 94],
        glow: [244, 80, 94],
        glowOpacity: 0.55,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    finished: {
        color: [52, 211, 153],
        tint: 0.35,
        eye: "happy",
        badge: "dot",
        badgeColor: [52, 211, 153],
        glow: [52, 211, 153],
        glowOpacity: 0.5,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
    ratelimit: {
        color: [251, 146, 60],
        tint: 0.72,
        eye: "tired",
        badge: "dot",
        badgeColor: [251, 146, 60],
        glow: [251, 146, 60],
        glowOpacity: 0.45,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: true,
        look: null,
        tilt: 0,
    },
    sleeping: {
        color: [148, 163, 184],
        tint: 0.32,
        eye: "closed",
        badge: null,
        badgeColor: [255, 255, 255],
        glow: [148, 163, 184],
        glowOpacity: 0.2,
        bounces: false,
        scans: false,
        breathes: true,
        zz: true,
        sweat: false,
        look: null,
        tilt: 0,
    },
    dizzy: {
        color: [244, 114, 182],
        tint: 0.7,
        eye: "spiral",
        badge: null,
        badgeColor: [255, 255, 255],
        glow: [244, 114, 182],
        glowOpacity: 0.55,
        bounces: false,
        scans: false,
        breathes: false,
        zz: false,
        sweat: false,
        look: null,
        tilt: 0,
    },
};

const EMOTES: Record<BotEmote, { eye: EyeShape }> = {
    love: { eye: "heart" },
    surprised: { eye: "dot" },
    proud: { eye: "star" },
    wink: { eye: "wink" },
    yawn: { eye: "tired" },
    happy: { eye: "happy" },
    annoyed: { eye: "line" },
};

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export class MochiBotEngine {
    yaw = 0;
    pitch = 0;
    roll = 0;
    tilt = 0;
    open = 1;
    sx = 1;
    sy = 1;
    oy = 0;
    ox = 0;
    tint = 0;
    morph = 0;
    hands = 0;
    blush = 0;
    es = 1;
    badgeS = 0;

    tgOy = 0;
    tgYaw = 0;
    tgPitch = 0;
    tgTilt = 0;
    tgSy = 1;
    tgSx = 1;
    tgEs = 1;

    state: BotState = "idle";
    cfg: BotStateCfg = BOT_STATES.idle;
    eyeOverride: EyeShape | null = null;
    eyeOverrideUntil = 0;
    badge: BadgeType | null = null;
    badgeCol: [number, number, number] = [255, 255, 255];

    tweens: Map<string, Tween> = new Map();
    locks: Set<string> = new Set();
    particles: Particle[] = [];
    nextBlink = 0;
    lookX = 0;
    lookY = 0;
    time0 = 0;
    lastTime = 0;
    waveUntil = 0;
    lastAmbient = 0;

    isMini = false;
    bodyColor: [number, number, number] | null = null;

    constructor() {
        this.time0 = performance.now();
        this.lastTime = this.time0;
        this.nextBlink = this.time0 + 1500 + Math.random() * 2000;
    }

    setState(state: BotState, force = false): void {
        const cfg = BOT_STATES[state];
        if (!cfg) return;
        if (this.state === state && !force) return;

        const prev = this.state;
        this.state = state;
        this.cfg = cfg;
        this.tgTilt = cfg.tilt;
        this.tint = cfg.tint;
        this.setBadge(cfg.badge, cfg.badgeColor);

        if (state === "finished") {
            this.animateRoll(950, 1);
            setTimeout(() => this.emitParticles("spark", 5), 500);
        } else if (state === "error") {
            this.anim("ox", [
                { target: 50, duration: 80, ease: E.out },
                { target: -50, duration: 70, ease: E.inOut },
                { target: 50, duration: 70, ease: E.inOut },
                { target: 0, duration: 90, ease: E.out },
            ]);
        } else if (state === "approval") {
            this.anim("oy", [
                { target: -20, duration: 150, ease: E.out },
                { target: 0, duration: 300, ease: E.back },
            ]);
        } else if (state === "dizzy") {
            this.animateRoll(1300, 2);
        } else if (state === "question") {
            this.blink();
        } else if (state === "ratelimit") {
            this.emitParticles("sweat", 1);
        } else if (prev !== "idle" || state !== "idle") {
            this.blink();
        }
    }

    setBadge(badge: BadgeType | null, color: [number, number, number]): void {
        this.badge = badge;
        this.badgeCol = color;
        if (badge) {
            this.anim("badgeS", [{ target: 0, duration: 90, ease: E.inOut }]);
            setTimeout(() => {
                this.anim("badgeS", [{ target: 1, duration: 280, ease: E.back }]);
            }, 100);
        }
    }

    blink(): void {
        if (this.locks.has("open")) return;
        this.anim("open", [
            { target: 0.06, duration: 70, ease: E.inOut },
            { target: 1, duration: 130, ease: E.out },
        ]);
    }

    squash(): void {
        this.anim("sy", [
            { target: 0.78, duration: 70, ease: E.out },
            { target: 1.1, duration: 130, ease: E.out },
            { target: 1, duration: 170, ease: E.inOut },
        ]);
        this.anim("sx", [
            { target: 1.16, duration: 70, ease: E.out },
            { target: 0.95, duration: 130, ease: E.out },
            { target: 1, duration: 170, ease: E.inOut },
        ]);
    }

    animateRoll(duration = 900, turns = 1): void {
        this.roll = 0;
        this.anim("roll", [
            { target: Math.PI * 2 * turns, duration, ease: E.inOut },
        ], () => {
            this.roll = 0;
        });
    }

    greet(): void {
        this.anim("hands", [{ target: 1, duration: 280, ease: E.back }]);
        this.waveUntil = performance.now() + 1500;
        this.emote("happy", 1500, true);
        setTimeout(() => {
            this.anim("hands", [{ target: 0, duration: 240, ease: E.inOut }]);
        }, 1550);
    }

    emote(emote: BotEmote, duration = 1800, silent = false): void {
        const def = EMOTES[emote];
        if (!def) return;

        this.eyeOverride = def.eye;
        this.eyeOverrideUntil = performance.now() + duration;

        if (emote === "love") {
            this.anim("blush", [
                { target: 1, duration: 300, ease: E.out },
                { target: 1, duration: duration - 600, ease: E.lin },
                { target: 0, duration: 300, ease: E.inOut },
            ]);
            this.emitParticles("heart", 4);
            this.anim("oy", [
                { target: -10, duration: 160, ease: E.out },
                { target: 0, duration: 300, ease: E.back },
            ]);
        } else if (emote === "surprised") {
            this.anim("oy", [
                { target: -30, duration: 140, ease: E.out },
                { target: 0, duration: 380, ease: E.back },
            ]);
            this.anim("es", [
                { target: 1.25, duration: 120, ease: E.out },
                { target: 1, duration: 500, ease: E.inOut },
            ]);
        } else if (emote === "proud") {
            this.emitParticles("star", 5);
            this.anim("tilt", [
                { target: -0.14, duration: 220, ease: E.out },
                { target: -0.14, duration: duration - 500, ease: E.lin },
                { target: 0, duration: 280, ease: E.inOut },
            ]);
        } else if (emote === "wink") {
            this.anim("tilt", [
                { target: 0.12, duration: 160, ease: E.out },
                { target: 0.12, duration: duration - 400, ease: E.lin },
                { target: 0, duration: 240, ease: E.inOut },
            ]);
        } else if (emote === "yawn") {
            this.anim("sy", [
                { target: 1.12, duration: 500, ease: E.inOut },
                { target: 1, duration: 500, ease: E.inOut },
            ]);
            this.anim("sx", [
                { target: 0.94, duration: 500, ease: E.inOut },
                { target: 1, duration: 500, ease: E.inOut },
            ]);
            setTimeout(() => {
                this.eyeOverride = "closed";
                this.emitParticles("z", 2);
            }, 700);
        } else if (emote === "happy") {
            this.anim("blush", [
                { target: 0.6, duration: 200, ease: E.out },
                { target: 0, duration: 600, ease: E.inOut },
            ]);
        }
    }

    slap(): void {
        this.squash();
        this.emote("annoyed", 800);
    }

    gulp(): void {
        this.anim("morph", [{ target: 1, duration: 380, ease: E.inOut }]);
    }

    emitParticles(type: ParticleType, count: number): void {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                type,
                x: (Math.random() - 0.5) * 0.9 + (type === "z" ? 0.55 : 0),
                y: -0.7 - Math.random() * 0.2,
                vx: (Math.random() - 0.5) * 0.35 + (type === "z" ? 0.18 : 0),
                vy: -(0.45 + Math.random() * 0.35),
                age: -i * 0.14,
                life: 1.3 + Math.random() * 0.5,
                rot: Math.random() * 6,
                size: 0.15 + Math.random() * 0.08,
            });
        }
    }

    update(dt: number): void {
        const now = performance.now();
        const t = (now - this.time0) / 1000;

        for (const tween of this.tweens.values()) {
            const key = tween.keys[tween.keyIndex];
            const p = Math.min(1, (now - tween.startTime) / key.duration);
            (this as any)[tween.property] = tween.from + (key.target - tween.from) * key.ease(p);

            if (p >= 1) {
                tween.from = key.target;
                tween.keyIndex++;
                tween.startTime = now;
                if (tween.keyIndex >= tween.keys.length) {
                    this.tweens.delete(tween.property);
                    this.locks.delete(tween.property);
                    const upper = tween.property.charAt(0).toUpperCase() + tween.property.slice(1);
                    (this as any)["tg" + upper] = tween.keys[tween.keys.length - 1].target;
                    if (tween.onComplete) tween.onComplete();
                }
            }
        }

        let ty = this.lookX * 0.62;
        let tp = this.lookY * 0.5;
        if (this.cfg.look) {
            ty = ty * 0.35 + this.cfg.look.x * 0.55;
            tp = tp * 0.3 + this.cfg.look.y * 0.5;
        }
        if (this.cfg.scans) {
            ty = Math.sin(t * 2.6) * 0.6;
            tp = -0.06;
        }
        if (this.state === "sleeping") {
            ty = 0;
            tp = -0.14;
        }
        if (this.state === "dizzy") {
            ty = Math.sin(t * 9) * 0.25;
        }

        this.tgYaw = ty;
        this.tgPitch = tp;
        this.tgOy = this.cfg.bounces ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
        this.tgSy = this.cfg.breathes ? 1 + Math.sin(t * 1.8) * 0.035 : 1;
        this.tgSx = this.cfg.breathes ? 1 - Math.sin(t * 1.8) * 0.02 : 1;

        const kLook = 1 - Math.pow(0.0025, dt);
        const kGen = 1 - Math.pow(0.0008, dt);

        for (const key of ["yaw", "pitch", "tilt", "oy", "sy", "sx", "es"] as const) {
            if (this.locks.has(key)) continue;
            const upper = key.charAt(0).toUpperCase() + key.slice(1);
            (this as any)[key] += ((this as any)["tg" + upper] - (this as any)[key]) * (key === "yaw" || key === "pitch" ? kLook : kGen);
        }

        const targetColor = this.bodyColor ?? this.cfg.color;
        const currentColor = (this as any)._col ?? this.cfg.color;
        const mix = 1 - Math.pow(0.002, dt);
        (this as any)._col = [
            currentColor[0] + (targetColor[0] - currentColor[0]) * mix,
            currentColor[1] + (targetColor[1] - currentColor[1]) * mix,
            currentColor[2] + (targetColor[2] - currentColor[2]) * mix,
        ];

        if (now > this.nextBlink) {
            if (this.state !== "sleeping" && this.state !== "dizzy") {
                this.blink();
                if (Math.random() < 0.22) setTimeout(() => this.blink(), 230);
            }
            this.nextBlink = now + 2200 + Math.random() * 3200;
        }

        if (this.eyeOverride && now > this.eyeOverrideUntil) {
            this.eyeOverride = null;
        }

        if (!this.isMini && now - this.lastAmbient > 1300) {
            this.lastAmbient = now;
            if (this.cfg.zz) this.emitParticles("z", 1);
            if (this.cfg.sweat && Math.random() < 0.5) this.emitParticles("sweat", 1);
        }

        for (const p of this.particles) {
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.5 * dt;
        }
        this.particles = this.particles.filter((p) => p.age < p.life);
    }

    draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.clearRect(0, 0, width, height);
        if (width <= 0 || height <= 0) return;
        const size = Math.min(width, height) * 0.3;
        const color = this.currentColor;
        const rgb = (value: number[]) => `rgb(${value.map(Math.round).join(",")})`;
        ctx.save();
        ctx.translate(width / 2 + this.ox * size / 100, height * 0.57 + this.oy * size);
        ctx.rotate(this.roll + this.tilt);
        ctx.scale(this.sx, this.sy);
        ctx.shadowColor = rgb(this.cfg.glow);
        ctx.shadowBlur = this.cfg.glowOpacity * size * 0.5;
        const gradient = ctx.createLinearGradient(0, -size, 0, size);
        gradient.addColorStop(0, rgb(color.map((value, i) => MOCHI_CONST.baseTop[i] * (1 - this.tint) + value * this.tint)));
        gradient.addColorStop(1, rgb(color.map((value, i) => MOCHI_CONST.baseBottom[i] * (1 - this.tint) + value * this.tint)));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(-size, -size * 0.86, size * 2, size * 1.72, size * 0.65);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgb(MOCHI_CONST.ink);
        ctx.strokeStyle = rgb(MOCHI_CONST.ink);
        ctx.lineWidth = size * 0.075;
        ctx.lineCap = "round";
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate((side * MOCHI_CONST.eyeSp + this.yaw * 0.25) * size, (MOCHI_CONST.eyeP + this.pitch * 0.22) * size);
            ctx.scale(this.es, Math.max(0.06, this.open));
            const shape = this.eyeShape;
            ctx.beginPath();
            if (["closed", "line", "flat", "tired"].includes(shape) || (shape === "wink" && side === 1)) {
                ctx.moveTo(-size * 0.13, 0); ctx.lineTo(size * 0.13, 0); ctx.stroke();
            } else if (shape === "happy") {
                ctx.arc(0, size * 0.07, size * 0.13, Math.PI, Math.PI * 2); ctx.stroke();
            } else if (shape === "spiral") {
                for (let angle = 0; angle < Math.PI * 5; angle += 0.15) {
                    const radius = size * 0.14 * angle / (Math.PI * 5);
                    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
                }
                ctx.stroke();
            } else if (shape === "heart" || shape === "star") {
                ctx.font = `${size * 0.4}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(shape === "heart" ? "♥" : "★", 0, 0);
            } else {
                const eyeWidth = size * MOCHI_CONST.eyeW * (shape === "wide" ? 1.2 : 1);
                const eyeHeight = size * MOCHI_CONST.eyeH * (shape === "dot" ? 0.6 : 1);
                ctx.roundRect(-eyeWidth / 2, -eyeHeight / 2, eyeWidth, eyeHeight, eyeWidth / 2); ctx.fill();
            }
            ctx.restore();
        }
        if (this.blush > 0) {
            ctx.fillStyle = `rgba(244,114,182,${this.blush * 0.5})`;
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * size * 0.65, size * 0.13, size * 0.17, size * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
        }
        if (this.hands > 0) {
            ctx.fillStyle = gradient;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.ellipse(side * size * 1.06, -size * 0.2 + Math.sin(performance.now() / 120) * size * 0.1, size * 0.16, size * 0.25 * this.hands, side * 0.3, 0, Math.PI * 2); ctx.fill();
            }
        }
        if (this.badge && this.badgeS > 0) {
            ctx.save(); ctx.translate(size * 0.86, -size * 0.75); ctx.scale(this.badgeS, this.badgeS);
            ctx.fillStyle = rgb(this.badgeCol); ctx.beginPath(); ctx.arc(0, 0, size * 0.24, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "white"; ctx.font = `bold ${size * 0.3}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(this.badge === "bang" ? "!" : this.badge === "question" ? "?" : this.badge === "dots" ? "…" : "•", 0, 0);
            ctx.restore();
        }
        ctx.restore();
        for (const particle of this.particles) {
            if (particle.age < 0) continue;
            ctx.save(); ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
            ctx.translate(width / 2 + particle.x * size, height * 0.57 + particle.y * size); ctx.rotate(particle.rot);
            ctx.fillStyle = rgb(this.cfg.color); ctx.font = `${particle.size * size}px sans-serif`; ctx.textAlign = "center";
            ctx.fillText(({ heart: "♥", star: "★", spark: "✦", sweat: "●", z: "z" })[particle.type], 0, 0); ctx.restore();
        }
    }

    private anim(property: string, keys: TweenKey[], onComplete?: () => void): void {
        this.tweens.delete(property);
        this.tweens.set(property, {
            property,
            keys,
            keyIndex: 0,
            from: (this as any)[property] ?? 0,
            startTime: performance.now(),
            onComplete,
        });
        this.locks.add(property);
    }

    get currentColor(): [number, number, number] {
        return (this as any)._col ?? this.cfg.color;
    }

    get eyeShape(): EyeShape {
        return this.eyeOverride ?? this.cfg.eye;
    }
}