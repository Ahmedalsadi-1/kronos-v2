// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type GameProject = {
    version: 1;
    title: string;
    mode: "collect" | "dodge";
    speed: number;
    spawnRate: number;
    duration: number;
    playerColor: string;
};

export const DefaultGameProject: GameProject = {
    version: 1,
    title: "Orbit Runner",
    mode: "collect",
    speed: 320,
    spawnRate: 2,
    duration: 45,
    playerColor: "#a78bfa",
};

export function normalizeGameProject(input: Partial<GameProject>): GameProject {
    const bounded = (value: number, fallback: number, min: number, max: number) =>
        Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    return {
        version: 1,
        title: typeof input?.title === "string" ? input.title.slice(0, 80) : DefaultGameProject.title,
        mode: input?.mode === "dodge" ? "dodge" : "collect",
        speed: bounded(input?.speed, 320, 80, 800),
        spawnRate: bounded(input?.spawnRate, 2, 0.5, 8),
        duration: bounded(input?.duration, 45, 10, 180),
        playerColor: /^#[0-9a-f]{6}$/i.test(input?.playerColor ?? "") ? input.playerColor : "#a78bfa",
    };
}

export function gameRuntime(project: GameProject) {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    const status = document.querySelector("#status");
    const restart = document.querySelector("#restart") as HTMLButtonElement;
    const keys = new Set<string>();
    let objects: { x: number; y: number; velocity: number }[] = [];
    let x = 320;
    let score = 0;
    let elapsed = 0;
    let spawn = 0;
    let last = 0;
    let running = true;
    let paused = false;
    const reset = () => {
        objects = [];
        x = 320;
        score = 0;
        elapsed = 0;
        spawn = 0;
        running = true;
        paused = false;
        keys.clear();
    };
    restart.onclick = reset;
    document.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
        keys.add(event.key.toLowerCase());
        if (event.key === " " && !event.repeat) paused = !paused;
    });
    document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => {
        keys.clear();
        paused = true;
    });
    canvas.addEventListener("pointermove", (event) => {
        if (event.buttons || event.pointerType === "touch") {
            const rect = canvas.getBoundingClientRect();
            x = Math.max(16, Math.min(624, ((event.clientX - rect.left) * 640) / rect.width));
        }
    });
    const frame = (now: number) => {
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
        last = now;
        if (running && !paused) {
            elapsed += dt;
            spawn += dt;
            const direction =
                Number(keys.has("arrowright") || keys.has("d")) - Number(keys.has("arrowleft") || keys.has("a"));
            x = Math.max(16, Math.min(624, x + direction * project.speed * dt));
            while (spawn >= 1 / project.spawnRate) {
                spawn -= 1 / project.spawnRate;
                objects.push({ x: 16 + Math.random() * 608, y: -16, velocity: 100 + Math.random() * 100 });
            }
            objects = objects.filter((object) => {
                object.y += object.velocity * dt;
                if (Math.abs(object.x - x) < 25 && Math.abs(object.y - 330) < 24) {
                    if (project.mode === "dodge") running = false;
                    else score += 1;
                    return false;
                }
                return object.y < 380;
            });
            if (elapsed >= project.duration) running = false;
        }
        context.fillStyle = "#101018";
        context.fillRect(0, 0, 640, 380);
        context.strokeStyle = "#242433";
        for (let row = 0; row < 380; row += 40) {
            context.beginPath();
            context.moveTo(0, row);
            context.lineTo(640, row);
            context.stroke();
        }
        context.fillStyle = project.mode === "collect" ? "#fbbf24" : "#fb7185";
        for (const object of objects) {
            context.beginPath();
            context.arc(object.x, object.y, 10, 0, Math.PI * 2);
            context.fill();
        }
        context.fillStyle = project.playerColor;
        context.fillRect(x - 16, 316, 32, 28);
        status.textContent = `${paused ? "Paused · " : ""}${project.mode === "collect" ? `Score ${score}` : `Survived ${elapsed.toFixed(1)}s`} · ${Math.max(0, project.duration - elapsed).toFixed(1)}s remaining${running ? "" : " · Game over — Restart to play again"}`;
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

export function exportGameHtml(input: Partial<GameProject>): string {
    const project = normalizeGameProject(input);
    const escape = (value: string) =>
        value.replace(
            /[&<>"']/g,
            (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
        );
    const data = JSON.stringify(project).replace(/</g, "\\u003c");
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(project.title)}</title><style>body{margin:0;background:#101018;color:#eee;font:15px system-ui;display:grid;place-content:center;min-height:100vh}main{width:min(95vw,800px)}canvas{width:100%;border-radius:12px;touch-action:none}button{background:#333347;color:white;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}p{color:#bbb}</style><main><h1>${escape(project.title)}</h1><canvas width="640" height="380" tabindex="0" aria-label="Game field"></canvas><p id="status" role="status"></p><button id="restart">Restart</button><p>Move: ← → or A / D. Touch: drag. Space: pause. ${project.mode === "collect" ? "Catch the gold orbs." : "Avoid the red orbs."}</p></main><script>(${gameRuntime.toString()})(${data});</script></html>`;
}
