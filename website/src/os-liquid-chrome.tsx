import { useEffect, useRef } from "react";
import { LiquidChromeFragmentShader, LiquidChromeVertexShader } from "../../frontend/util/liquid-chrome-shader";

export function LiquidChrome({ phase = 0 }: { phase?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
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
        const motion = matchMedia("(prefers-reduced-motion: reduce)");
        let visible = false;
        let frame = 0;
        let lastFrame = 0;
        let elapsed = phase;
        const draw = () => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resolution, canvas.width, canvas.height);
            gl.uniform1f(time, elapsed);
            gl.uniform1f(dark, document.documentElement.dataset.theme === "dark" ? 1 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };
        const tick = (now: number) => {
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
            // Chrome reflections stay soft at a capped resolution, including on Retina displays.
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
        const theme = new MutationObserver(sync);
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        motion.addEventListener("change", sync);
        document.addEventListener("visibilitychange", sync);
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            intersection.disconnect();
            theme.disconnect();
            motion.removeEventListener("change", sync);
            document.removeEventListener("visibilitychange", sync);
            gl.deleteBuffer(buffer);
            shaders.forEach((shader) => gl.deleteShader(shader));
            gl.deleteProgram(program);
        };
    }, [phase]);

    return <canvas ref={canvasRef} className="os-liquid-chrome" aria-hidden="true" />;
}
