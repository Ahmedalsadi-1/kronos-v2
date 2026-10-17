import { drawAgentCursor, mountAgentCursor } from "../../frontend/util/agent-cursor-feedback";
const stages = [
    { label: "Rest", age: -1 },
    { label: "Press · 80 ms", age: 80 },
    { label: "Release · 160 ms", age: 160 },
];
for (const stage of stages) {
    const section = document.createElement("section");
    section.innerHTML = `<h2>${stage.label}</h2><canvas width="360" height="180"></canvas>`;
    document.querySelector("#stages").appendChild(section);
    const canvas = section.querySelector("canvas");
    drawAgentCursor(canvas.getContext("2d"), { x: 100, y: 95 }, stage.age, "Click Save");
}
const host = document.querySelector<HTMLElement>("#live");
const cursor = mountAgentCursor(host);
let timer: ReturnType<typeof setTimeout>;
const run = () => {
    clearTimeout(timer);
    cursor.clear();
    const targets = [
        { x: 75, y: 110, label: "Inspect controls", click: false },
        { x: host.clientWidth * 0.5, y: 140, label: "Click Save", click: true },
        { x: host.clientWidth * 0.75, y: 100, label: "Inspect result", click: false },
        { x: host.clientWidth * 0.28, y: 150, label: "Click Done", click: true },
    ];
    let index = 0;
    const step = () => {
        const target = targets[index++];
        cursor.update(target, target.label, target.click);
        if (index < targets.length) timer = setTimeout(step, 1200);
    };
    step();
};
document.querySelector("#run").addEventListener("click", run);
