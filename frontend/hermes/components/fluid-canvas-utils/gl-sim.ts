// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const SIM_PRECISION = "precision highp float;";
const VertexSource = `${SIM_PRECISION}
attribute vec2 aPosition;
uniform vec2 uTexel;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(uTexel.x, 0.0);
    vR = vUv + vec2(uTexel.x, 0.0);
    vT = vUv + vec2(0.0, uTexel.y);
    vB = vUv - vec2(0.0, uTexel.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

type SimContext = { gl: WebGLRenderingContext; type: number; linear: boolean; rgba: number; rg: number; r: number };
export type SimTarget = {
    width: number;
    height: number;
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    attach: (unit: number) => number;
};
export type SimPair = {
    width: number;
    height: number;
    read: SimTarget;
    write: SimTarget;
    swap: () => void;
};

export function createSimContext(canvas: HTMLCanvasElement): SimContext {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    const halfFloat = gl.getExtension("OES_texture_half_float");
    gl.getExtension("EXT_color_buffer_half_float");
    if (!halfFloat) return null;
    const sim = {
        gl,
        type: halfFloat.HALF_FLOAT_OES,
        linear: Boolean(gl.getExtension("OES_texture_half_float_linear")),
        rgba: gl.RGBA,
        rg: gl.RGBA,
        r: gl.RGBA,
    };
    try {
        const probe = createTarget(sim, 2, 2, gl.RGBA, gl.NEAREST);
        deleteTarget(sim, probe);
        return sim;
    } catch {
        return null;
    }
}

export function createTarget(
    sim: SimContext,
    width: number,
    height: number,
    format: number,
    filter: number
): SimTarget {
    const { gl } = sim;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, sim.type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        throw new Error("Fluid framebuffer is unsupported");
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
        width,
        height,
        texture,
        framebuffer,
        attach(unit) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return unit;
        },
    };
}

export function createPair(sim: SimContext, width: number, height: number, format: number, filter: number): SimPair {
    const read = createTarget(sim, width, height, format, filter);
    let write: SimTarget;
    try {
        write = createTarget(sim, width, height, format, filter);
    } catch (error) {
        deleteTarget(sim, read);
        throw error;
    }
    return {
        width,
        height,
        read,
        write,
        swap() {
            [this.read, this.write] = [this.write, this.read];
        },
    };
}

export function deleteTarget({ gl }: SimContext, target: SimTarget) {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
}
export function deletePair(sim: SimContext, pair: SimPair) {
    deleteTarget(sim, pair.read);
    deleteTarget(sim, pair.write);
}

export function createSimProgram(gl: WebGLRenderingContext, fragment: string) {
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    try {
        for (const [type, source] of [
            [gl.VERTEX_SHADER, VertexSource],
            [gl.FRAGMENT_SHADER, fragment],
        ] as const) {
            const shader = gl.createShader(type);
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            gl.attachShader(program, shader);
        }
        gl.bindAttribLocation(program, 0, "aPosition");
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        const uniforms: Record<string, WebGLUniformLocation> = {};
        for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index++) {
            const { name } = gl.getActiveUniform(program, index);
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        return { program, uniforms, use: () => gl.useProgram(program) };
    } catch (error) {
        gl.deleteProgram(program);
        throw error;
    } finally {
        shaders.forEach((shader) => gl.deleteShader(shader));
    }
}

export function createQuad(gl: WebGLRenderingContext) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return () => gl.deleteBuffer(buffer);
}
export function blit(gl: WebGLRenderingContext, target: SimTarget) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? gl.drawingBufferWidth, target?.height ?? gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function createSimLoop(canvas: HTMLCanvasElement, frame: (dt: number) => void) {
    let requested = false;
    let visible = false;
    let handle = 0;
    let last = 0;
    const tick = (now: number) => {
        handle = 0;
        if (!requested || !visible || document.hidden) return;
        if (now - last >= 1000 / 30) {
            frame(Math.min((now - last) / 1000, 1 / 30));
            last = now;
        }
        handle = requestAnimationFrame(tick);
    };
    const sync = () => {
        cancelAnimationFrame(handle);
        handle = 0;
        last = performance.now();
        if (requested && visible && !document.hidden) handle = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return {
        start() {
            requested = true;
            sync();
        },
        stop() {
            requested = false;
            sync();
        },
        dispose() {
            requested = false;
            cancelAnimationFrame(handle);
            observer.disconnect();
            document.removeEventListener("visibilitychange", sync);
        },
    };
}

export function cssColourRgb(value: string, element: HTMLElement): [number, number, number] {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.display = "none";
    element.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const context = document.createElement("canvas").getContext("2d");
    context.fillStyle = resolved;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255];
}
export function luminance([r, g, b]: number[]) {
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
