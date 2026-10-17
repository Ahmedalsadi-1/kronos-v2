import { contextBridge, ipcRenderer } from "electron";
import type { AnnotationCommand, AnnotationSnapshot } from "../frontend/types/desktop-annotations";

export type OverlayAnimationCommand =
    | { type: "click"; x: number; y: number }
    | { type: "type"; x: number; y: number }
    | { type: "scroll"; x: number; y: number; direction?: "up" | "down" | "left" | "right" }
    | { type: "drag"; path: Array<{ x: number; y: number }> }
    | { type: "hover"; x: number; y: number }
    | { type: "trace"; path: Array<{ x: number; y: number }> }
    | { type: "wait"; x?: number; y?: number }
    | { type: "cursor_position"; x: number; y: number }
    | { type: "screenshot"; x?: number; y?: number; width?: number; height?: number }
    | { type: "hide" };

contextBridge.exposeInMainWorld("overlayApi", {
    annotationCommand: (input: AnnotationCommand) => ipcRenderer.invoke("overlay-annotation-command", input),
    setInteractive: (interactive: boolean) => ipcRenderer.send("overlay-interactive", interactive),
    onAnnotations: (callback: (state: AnnotationSnapshot) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: AnnotationSnapshot) => callback(state);
        ipcRenderer.on("desktop-annotations", listener);
        return () => ipcRenderer.removeListener("desktop-annotations", listener);
    },
    onAnimation: (callback: (cmd: OverlayAnimationCommand) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, cmd: OverlayAnimationCommand) => callback(cmd);
        ipcRenderer.on("overlay-animation", listener);
        return () => ipcRenderer.removeListener("overlay-animation", listener);
    },
});
