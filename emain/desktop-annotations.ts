import type { AnnotationCommand, AnnotationSnapshot, DesktopAnnotation } from "../frontend/types/desktop-annotations";

export class DesktopAnnotations {
    private items: DesktopAnnotation[] = [];
    private drawing = false;
    private tool: DesktopAnnotation["kind"] = "pen";
    private timer: ReturnType<typeof setTimeout>;
    constructor(
        private publish: (state: AnnotationSnapshot) => void = () => {},
        private now = Date.now
    ) {}
    snapshot(): AnnotationSnapshot {
        return {
            items: this.items.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point })) })),
            drawing: this.drawing,
            tool: this.tool,
            origin: { x: 0, y: 0 },
        };
    }
    command(value: unknown): AnnotationSnapshot {
        const command = value as AnnotationCommand;
        if (!command || typeof command !== "object") throw new Error("Invalid annotation command.");
        if (command.action === "add") {
            const item = command.annotation;
            if (
                !item ||
                typeof item.id !== "string" ||
                !/^[\w:.-]{1,128}$/.test(item.id) ||
                !["pen", "arrow", "rectangle", "text", "spotlight", "caption"].includes(item.kind) ||
                !Array.isArray(item.points) ||
                item.points.length > 5000 ||
                !item.points.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)) ||
                (item.text != null && (typeof item.text !== "string" || item.text.length > 2000)) ||
                (item.color != null && !/^#[\da-f]{6}$/i.test(item.color)) ||
                (item.expiresAt != null && !Number.isFinite(item.expiresAt))
            )
                throw new Error("Invalid annotation data.");
            if (["text", "caption"].includes(item.kind) && !item.text?.trim())
                throw new Error("Annotation text is required.");
            if (item.kind !== "caption" && item.points.length < (["text"].includes(item.kind) ? 1 : 2))
                throw new Error("Annotation points are required.");
            if (this.items.length >= 200 && !this.items.some((entry) => entry.id === item.id))
                throw new Error("Clear annotations before adding more.");
            this.items = [
                ...this.items.filter((entry) => entry.id !== item.id),
                { ...item, points: item.points.map((point) => ({ ...point })) },
            ];
        } else if (command.action === "remove") this.items = this.items.filter((item) => item.id !== command.id);
        else if (command.action === "clear") {
            this.items = [];
            this.drawing = false;
        } else if (command.action === "undo") this.items = this.items.slice(0, -1);
        else if (command.action === "done") this.drawing = false;
        else if (
            command.action === "begin" &&
            ["pen", "arrow", "rectangle", "text", "spotlight"].includes(command.tool)
        ) {
            this.drawing = true;
            this.tool = command.tool;
        } else throw new Error("Unsupported annotation command.");
        return this.flush();
    }
    private flush() {
        clearTimeout(this.timer);
        this.items = this.items.filter((item) => item.expiresAt == null || item.expiresAt > this.now());
        const expiries = this.items.flatMap((item) => (item.expiresAt == null ? [] : [item.expiresAt]));
        if (expiries.length)
            this.timer = setTimeout(
                () => this.flush(),
                Math.min(2147483647, Math.max(1, Math.min(...expiries) - this.now()))
            );
        this.timer?.unref?.();
        const state = this.snapshot();
        this.publish(state);
        return state;
    }
    dispose() {
        clearTimeout(this.timer);
        this.items = [];
        this.drawing = false;
        this.publish(this.snapshot());
    }
}
