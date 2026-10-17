import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeWorkspaceSurface = "workspace" | "browser" | "sandbox" | "emulator" | "terminal" | "files" | "chat";
export interface NativeWorkspaceSnapshot {
    taskID: string;
    title: string;
    step: string;
    status: "running" | "waiting" | "completed" | "failed" | "idle";
    surface: NativeWorkspaceSurface;
}

const NativeWorkspace = registerPlugin<{
    update(snapshot: NativeWorkspaceSnapshot): Promise<{ liveActivity: boolean; reason?: string }>;
    end(): Promise<void>;
    requestNotifications(): Promise<{ granted: boolean }>;
    consumeNotificationLink(): Promise<{ url?: string }>;
    addListener(event: "notificationOpen", listener: (event: { url: string }) => void): Promise<PluginListenerHandle>;
}>("KronTermWorkspace");

export async function updateNativeWorkspace(snapshot: NativeWorkspaceSnapshot) {
    if (Capacitor.getPlatform() !== "ios") return { liveActivity: false };
    return NativeWorkspace.update(snapshot);
}

export async function endNativeWorkspace() {
    if (Capacitor.getPlatform() === "ios") await NativeWorkspace.end();
}

export function parseWorkspaceDeepLink(value: string): { surface: NativeWorkspaceSurface; taskID?: string } | null {
    try {
        const url = new URL(value);
        const surface = url.pathname.slice(1) as NativeWorkspaceSurface;
        if (
            url.protocol !== "kronterm:" ||
            url.hostname !== "surface" ||
            !["workspace", "browser", "sandbox", "emulator", "terminal", "files", "chat"].includes(surface)
        )
            return null;
        return { surface, taskID: url.searchParams.get("task")?.slice(0, 128) ?? undefined };
    } catch {
        return null;
    }
}

export async function requestWorkspaceNotifications(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "ios") return false;
    return (await NativeWorkspace.requestNotifications()).granted;
}

export async function listenWorkspaceNotifications(onOpen: (url: string) => void): Promise<() => void> {
    if (Capacitor.getPlatform() !== "ios") return () => {};
    let lastURL: string | undefined;
    const receive = (url: string) => {
        if (parseWorkspaceDeepLink(url)) {
            lastURL = url;
            onOpen(url);
        }
    };
    const listener = await NativeWorkspace.addListener("notificationOpen", ({ url }) => receive(url));
    try {
        const pending = await NativeWorkspace.consumeNotificationLink();
        if (pending.url && pending.url !== lastURL) receive(pending.url);
    } catch (error) {
        await listener.remove();
        throw error;
    }
    return () => {
        void listener.remove();
    };
}
