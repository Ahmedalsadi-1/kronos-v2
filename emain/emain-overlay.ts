import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import type { AnnotationCommand, AnnotationSnapshot } from "../frontend/types/desktop-annotations";
import { DesktopAnnotations } from "./desktop-annotations";
import { getElectronAppBasePath, isDevVite, unamePlatform } from "./emain-platform";

let overlayWindow: BrowserWindow = null;
let overlayBounds: Electron.Rectangle = null;
let overlayReady = false;
let overlayHideTimer: NodeJS.Timeout = null;
const pendingCommands: OverlayAnimationCommand[] = [];
const OverlayVisibleMs = 2600;
let annotationState: AnnotationSnapshot = { items: [], drawing: false, tool: "pen", origin: { x: 0, y: 0 } };
let annotationIpcRegistered = false;
export const desktopAnnotations = new DesktopAnnotations((state) => {
    annotationState = state;
    if (state.items.length || state.drawing) createOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.setFocusable(state.drawing);
    overlayWindow.setIgnoreMouseEvents(!state.drawing, { forward: true });
    if (state.items.length || state.drawing) {
        overlayWindow.showInactive();
        if (state.drawing) overlayWindow.focus();
    } else overlayWindow.hide();
    publishAnnotations();
});
function publishAnnotations() {
    if (!overlayReady || !overlayWindow || !overlayBounds) return;
    overlayWindow.webContents.send("desktop-annotations", {
        ...annotationState,
        origin: { x: overlayBounds.x, y: overlayBounds.y },
        captionArea: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
    });
}

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

function getAllDisplayBounds(): Electron.Rectangle {
    const displays = screen.getAllDisplays();
    const left = Math.min(...displays.map((display) => display.bounds.x));
    const top = Math.min(...displays.map((display) => display.bounds.y));
    const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
    const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function createOverlayWindow() {
    if (unamePlatform !== "darwin" || overlayWindow != null) {
        return;
    }
    const bounds = getAllDisplayBounds();
    overlayBounds = bounds;
    if (!annotationIpcRegistered) {
        annotationIpcRegistered = true;
        ipcMain.handle("overlay-annotation-command", (event, input: AnnotationCommand) => {
            if (
                !overlayWindow ||
                event.sender !== overlayWindow.webContents ||
                event.senderFrame !== event.sender.mainFrame
            )
                throw new Error("Untrusted annotation caller");
            if ((input?.action === "begin" || input?.action === "add") && !annotationState.drawing)
                throw new Error("Manual drawing is not active.");
            return desktopAnnotations.command(input);
        });
        ipcMain.on("overlay-interactive", (event, interactive: boolean) => {
            if (overlayWindow && event.sender === overlayWindow.webContents)
                overlayWindow.setIgnoreMouseEvents(!annotationState.drawing && interactive !== true, { forward: true });
        });
        app.on("before-quit", () => desktopAnnotations.dispose());
        const refreshDisplayBounds = () => {
            if (!overlayWindow || overlayWindow.isDestroyed()) return;
            overlayBounds = getAllDisplayBounds();
            overlayWindow.setBounds(overlayBounds);
            publishAnnotations();
        };
        screen.on("display-metrics-changed", refreshDisplayBounds);
        screen.on("display-added", refreshDisplayBounds);
        screen.on("display-removed", refreshDisplayBounds);
    }

    overlayWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,
        fullscreenable: false,
        hasShadow: false,
        show: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        type: "panel",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(getElectronAppBasePath(), "preload", "preload-overlay.cjs"),
        },
    });

    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    overlayWindow.webContents.once("did-finish-load", () => {
        overlayReady = true;
        publishAnnotations();
        for (const command of pendingCommands.splice(0)) {
            sendOverlayAnimation(command);
        }
    });

    overlayWindow.on("closed", () => {
        overlayWindow = null;
        overlayBounds = null;
        overlayReady = false;
    });

    if (isDevVite) {
        void overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
    } else {
        void overlayWindow.loadFile(path.join(getElectronAppBasePath(), "frontend", "overlay.html"));
    }
}

export function sendOverlayAnimation(cmd: OverlayAnimationCommand) {
    if (cmd.type === "screenshot") {
        return;
    }
    if (cmd.type === "hide" && (overlayWindow == null || overlayWindow.isDestroyed())) {
        return;
    }
    if (overlayWindow == null || overlayWindow.isDestroyed()) {
        createOverlayWindow();
    }
    if (overlayWindow == null || overlayWindow.isDestroyed() || overlayBounds == null) {
        return;
    }
    if (cmd.type === "hide") {
        if (!annotationState.items.length && !annotationState.drawing) overlayWindow.hide();
        if (overlayHideTimer != null) {
            clearTimeout(overlayHideTimer);
            overlayHideTimer = null;
        }
    } else {
        overlayWindow.showInactive();
        if (overlayHideTimer != null) {
            clearTimeout(overlayHideTimer);
        }
        overlayHideTimer = setTimeout(() => {
            if (!annotationState.items.length && !annotationState.drawing) destroyOverlayWindow();
            overlayHideTimer = null;
        }, OverlayVisibleMs);
    }
    if (!overlayReady) {
        pendingCommands.push(cmd);
        return;
    }
    const offsetPoint = (point: { x: number; y: number }) => ({
        x: point.x - overlayBounds.x,
        y: point.y - overlayBounds.y,
    });
    if ("path" in cmd) {
        overlayWindow.webContents.send("overlay-animation", { ...cmd, path: cmd.path.map(offsetPoint) });
        return;
    }
    if ("x" in cmd && typeof cmd.x === "number" && "y" in cmd && typeof cmd.y === "number") {
        overlayWindow.webContents.send("overlay-animation", { ...cmd, ...offsetPoint({ x: cmd.x, y: cmd.y }) });
        return;
    }
    overlayWindow.webContents.send("overlay-animation", cmd);
}

export function destroyOverlayWindow() {
    if (overlayHideTimer != null) {
        clearTimeout(overlayHideTimer);
        overlayHideTimer = null;
    }
    if (overlayWindow != null && !overlayWindow.isDestroyed()) {
        overlayWindow.close();
    }
    overlayWindow = null;
    overlayBounds = null;
}
