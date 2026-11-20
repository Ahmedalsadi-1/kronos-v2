// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import { LiquidChromeFragmentShader, LiquidChromeVertexShader } from "../../util/liquid-chrome-shader";

export function makeChromeVariation() {
    return { purple: Math.random() < 0.35, seed: Math.floor(Math.random() * 1000) };
}

export function ChromeBackground({ variation }: { variation: ReturnType<typeof makeChromeVariation> }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof window.matchMedia !== "function") return;
        const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });
        if (!gl) return;
        const shaders: WebGLShader[] = [];
        const compile = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
        };
        const vertex = compile(gl.VERTEX_SHADER, LiquidChromeVertexShader);
        const fragment = compile(gl.FRAGMENT_SHADER, LiquidChromeFragmentShader);
        const program = gl.createProgram();
        if (!vertex || !fragment || !program) {
            shaders.forEach((shader) => gl.deleteShader(shader));
            if (program) gl.deleteProgram(program);
            return;
        }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            shaders.forEach((shader) => gl.deleteShader(shader));
            gl.deleteProgram(program);
            return;
        }
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const resolution = gl.getUniformLocation(program, "resolution");
        const time = gl.getUniformLocation(program, "time");
        const dark = gl.getUniformLocation(program, "dark");
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let visible = false;
        let frame = 0;
        let lastFrame = 0;
        let elapsed = variation.seed / 20;
        const draw = () => {
            if (gl.isContextLost()) return;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resolution, canvas.width, canvas.height);
            gl.uniform1f(time, elapsed);
            gl.uniform1f(dark, variation.purple ? 0 : 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };
        const tick = (now: number) => {
            if (gl.isContextLost()) return;
            if (now - lastFrame >= 1000 / 24) {
                elapsed += Math.min((now - lastFrame) / 1000, 0.08);
                lastFrame = now;
                draw();
            }
            frame = requestAnimationFrame(tick);
        };
        const sync = () => {
            cancelAnimationFrame(frame);
            draw();
            if (visible && !document.hidden && !motion.matches) {
                lastFrame = performance.now();
                frame = requestAnimationFrame(tick);
            }
        };
        const resize = new ResizeObserver(() => {
            canvas.width = Math.max(1, Math.min(1100, Math.round(canvas.clientWidth * 0.8)));
            canvas.height = Math.max(
                1,
                Math.round((canvas.width * canvas.clientHeight) / Math.max(1, canvas.clientWidth))
            );
            draw();
        });
        resize.observe(canvas);
        const intersection = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
        });
        intersection.observe(canvas);
        motion.addEventListener("change", sync);
        document.addEventListener("visibilitychange", sync);
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            intersection.disconnect();
            motion.removeEventListener("change", sync);
            document.removeEventListener("visibilitychange", sync);
            gl.deleteBuffer(buffer);
            shaders.forEach((shader) => gl.deleteShader(shader));
            gl.deleteProgram(program);
        };
    }, [variation.seed, variation.purple]);
    return <canvas ref={canvasRef} className="concept-chrome-background" aria-hidden="true" />;
}
