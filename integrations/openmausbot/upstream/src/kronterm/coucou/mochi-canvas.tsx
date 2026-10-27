// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { MochiBotEngine, type BotEmote, type BotState } from "./bot-engine";

export interface MochiCanvasProps {
    state?: BotState;
    emote?: BotEmote;
    mini?: boolean;
    bodyColor?: string;
    lookX?: number;
    lookY?: number;
    className?: string;
    width?: number;
    height?: number;
    appearance?: "coucou" | "kronterm";
    animated?: boolean;
}

export function MochiCanvas({
    state = "idle",
    emote,
    mini = false,
    bodyColor,
    lookX = 0,
    lookY = 0,
    className,
    width = 230,
    height = 230,
    appearance = "coucou",
    animated = true,
}: MochiCanvasProps) {
    const [reducedMotion, setReducedMotion] = useState(
        () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    );
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<MochiBotEngine | null>(null);
    const lookRef = useRef({ x: lookX, y: lookY });
    lookRef.current = { x: lookX, y: lookY };
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!preference) return;
        const update = () => setReducedMotion(preference.matches);
        preference.addEventListener("change", update);
        return () => preference.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const engine = new MochiBotEngine();
        engine.isMini = mini;
        engine.catEars = appearance === "kronterm";
        if (bodyColor) {
            const hex = bodyColor.replace("#", "");
            const n = parseInt(hex, 16);
            engine.bodyColor = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
        }
        engine.lookX = lookX;
        engine.lookY = lookY;
        engine.setState(state, true);
        engineRef.current = engine;

        if (!animated || reducedMotion) {
            engine.update(0.016);
            engine.draw(ctx, width, height);
            return () => {
                engineRef.current = null;
            };
        }

        const loop = () => {
            const now = performance.now();
            const dt = Math.min(0.05, (now - engine.lastTime) / 1000);
            engine.lastTime = now;
            engine.lookX = lookRef.current.x;
            engine.lookY = lookRef.current.y;
            engine.update(dt);
            engine.draw(ctx, width, height);
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            engineRef.current = null;
        };
    }, [mini, bodyColor, width, height, appearance, animated, reducedMotion, state]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setState(state, true);
        }
    }, [state]);

    useEffect(() => {
        if (engineRef.current && emote) {
            engineRef.current.emote(emote);
            if (!animated || reducedMotion) {
                const ctx = canvasRef.current?.getContext("2d");
                if (ctx) engineRef.current.draw(ctx, width, height);
            }
        }
    }, [emote, animated, reducedMotion, width, height]);

    return <canvas ref={canvasRef} className={className} style={{ width, height }} aria-hidden="true" />;
}
