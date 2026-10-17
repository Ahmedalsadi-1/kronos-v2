export type AnnotationPoint = { x: number; y: number };
export type DesktopAnnotation = {
    id: string;
    kind: "pen" | "arrow" | "rectangle" | "text" | "spotlight" | "caption";
    points: AnnotationPoint[];
    text?: string;
    color?: string;
    expiresAt?: number;
};
export type AnnotationSnapshot = {
    items: DesktopAnnotation[];
    drawing: boolean;
    tool: DesktopAnnotation["kind"];
    origin: AnnotationPoint;
    captionArea?: { x: number; y: number; width: number; height: number };
};
export type AnnotationCommand =
    | { action: "add"; annotation: DesktopAnnotation }
    | { action: "remove"; id: string }
    | { action: "clear" | "undo" | "done" }
    | { action: "begin"; tool: "pen" | "arrow" | "rectangle" | "text" | "spotlight" };
