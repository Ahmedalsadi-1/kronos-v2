import type { AnnotationCommand, AnnotationPoint, AnnotationSnapshot } from "../types/desktop-annotations";

type AnnotationApi = {
    annotationCommand: (command: AnnotationCommand) => Promise<unknown>;
    setInteractive: (value: boolean) => void;
    onAnnotations: (listener: (state: AnnotationSnapshot) => void) => () => void;
};
const api = (window as unknown as { overlayApi: AnnotationApi }).overlayApi;
const layer = document.createElement("div");
layer.className = "desktop-annotation-layer";
document.body.append(layer);
let state: AnnotationSnapshot = { items: [], drawing: false, tool: "pen", origin: { x: 0, y: 0 } };
let points: AnnotationPoint[] = [];
let text = "";
const send = (command: AnnotationCommand) => api?.annotationCommand(command).catch(console.error);
function button(label: string, action: () => void) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.onclick = action;
    return element;
}
function render() {
    layer.replaceChildren();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText = `position:absolute;inset:0;pointer-events:${state.drawing ? "auto" : "none"};touch-action:none`;
    for (const item of state.items) {
        if (item.kind === "caption") {
            const caption = document.createElement("div");
            caption.className = "desktop-annotation-caption";
            if (state.captionArea) {
                caption.style.left = `${state.captionArea.x - state.origin.x + state.captionArea.width / 2}px`;
                caption.style.top = `${state.captionArea.y - state.origin.y + state.captionArea.height - 160}px`;
                caption.style.bottom = "auto";
                caption.style.maxWidth = `${Math.max(200, Math.min(600, state.captionArea.width - 32))}px`;
            }
            const body = document.createElement("span");
            body.textContent = item.text;
            caption.append(
                body,
                button("×", () => void send({ action: "remove", id: item.id }))
            );
            caption.onmouseenter = () => api?.setInteractive(true);
            caption.onmouseleave = () => api?.setInteractive(false);
            layer.append(caption);
            continue;
        }
        const p = item.points.map((point) => ({ x: point.x - state.origin.x, y: point.y - state.origin.y }));
        if (!p.length) continue;
        const last = p[p.length - 1];
        let element: SVGElement;
        if (item.kind === "rectangle" || item.kind === "spotlight") {
            element = document.createElementNS(svg.namespaceURI, "rect") as SVGElement;
            const x = Math.min(p[0].x, last.x),
                y = Math.min(p[0].y, last.y),
                width = Math.abs(last.x - p[0].x),
                height = Math.abs(last.y - p[0].y);
            for (const [key, value] of Object.entries({ x, y, width, height, rx: 8 }))
                element.setAttribute(key, String(value));
            if (item.kind === "spotlight") {
                const shade = document.createElementNS(svg.namespaceURI, "path");
                shade.setAttribute(
                    "d",
                    `M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}v${height}h${width}v-${height}Z`
                );
                shade.setAttribute("fill-rule", "evenodd");
                shade.setAttribute("fill", "rgba(0,0,0,.35)");
                svg.append(shade);
            }
        } else if (item.kind === "text") {
            element = document.createElementNS(svg.namespaceURI, "text") as SVGElement;
            element.setAttribute("x", String(p[0].x));
            element.setAttribute("y", String(p[0].y));
            element.setAttribute("font-size", "20");
            element.textContent = item.text;
        } else {
            element = document.createElementNS(svg.namespaceURI, "path") as SVGElement;
            let d = p.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
            if (item.kind === "arrow") {
                const a = Math.atan2(last.y - p[0].y, last.x - p[0].x);
                d += ` M${last.x - 14 * Math.cos(a - 0.5)} ${last.y - 14 * Math.sin(a - 0.5)}L${last.x} ${last.y}L${last.x - 14 * Math.cos(a + 0.5)} ${last.y - 14 * Math.sin(a + 0.5)}`;
            }
            element.setAttribute("d", d);
        }
        element.setAttribute("fill", item.kind === "text" ? (item.color ?? "#ffcc66") : "none");
        element.setAttribute("stroke", item.color ?? "#ffcc66");
        element.setAttribute("stroke-width", item.kind === "text" ? "0" : "3");
        svg.append(element);
    }
    layer.prepend(svg);
    if (!state.drawing) return;
    svg.onpointerdown = (event) => {
        points = [{ x: event.clientX + state.origin.x, y: event.clientY + state.origin.y }];
        svg.setPointerCapture(event.pointerId);
    };
    svg.onpointermove = (event) => {
        if (points.length && points.length < 5000)
            points.push({ x: event.clientX + state.origin.x, y: event.clientY + state.origin.y });
    };
    svg.onpointerup = (event) => {
        if (!points.length) return;
        points.push({ x: event.clientX + state.origin.x, y: event.clientY + state.origin.y });
        void send({
            action: "add",
            annotation: {
                id: crypto.randomUUID(),
                kind: state.tool,
                points: state.tool === "pen" ? points : [points[0], points[points.length - 1]],
                text: state.tool === "text" ? text : undefined,
            },
        });
        points = [];
    };
    svg.onpointercancel = () => {
        points = [];
    };
    const toolbar = document.createElement("nav");
    toolbar.className = "desktop-annotation-toolbar";
    toolbar.setAttribute("aria-label", "Drawing tools");
    for (const tool of ["pen", "arrow", "rectangle", "text", "spotlight"] as const)
        toolbar.append(button(tool, () => void send({ action: "begin", tool })));
    const input = document.createElement("input");
    input.placeholder = "Text label";
    input.value = text;
    input.setAttribute("aria-label", "Annotation text");
    input.oninput = () => {
        text = input.value;
    };
    if (state.tool === "text") toolbar.append(input);
    toolbar.append(
        button("Undo", () => void send({ action: "undo" })),
        button("Clear", () => void send({ action: "clear" })),
        button("Done", () => void send({ action: "done" }))
    );
    layer.append(toolbar);
}
api?.onAnnotations((next) => {
    state = next;
    render();
});
window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        points = [];
        void send({ action: "done" });
    }
});
window.addEventListener("blur", () => {
    if (state.drawing) {
        points = [];
        void send({ action: "done" });
    }
});
