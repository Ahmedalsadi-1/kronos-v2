import type { BlockNodeModel } from "@/app/block/blocktypes";
import { getApi } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { WaveEnv } from "@/app/waveenv/waveenv";
import { Atom, atom, PrimitiveAtom } from "jotai";
import { AppStreamView } from "./appstream";

export type AppStreamTransport = "legacy-snapshot" | "native-media";

export class AppStreamViewModel implements ViewModel {
    viewType = "appstream";
    blockId: string;
    nodeModel: BlockNodeModel;
    env: WaveEnv;
    blockAtom: Atom<Block>;
    noPadding = atom(true);
    viewIcon = atom("desktop");
    viewName: Atom<string>;

    streamUrlAtom = atom<string>("");
    mediaStreamAtom = atom(null) as PrimitiveAtom<MediaStream>;
    transportAtom = atom<AppStreamTransport>("legacy-snapshot");
    captureFallbackReasonAtom = atom<string>("");
    appNameAtom: Atom<string>;
    appIdAtom: Atom<string>;
    statusAtom = atom<"idle" | "starting" | "streaming" | "error">("idle");
    errorAtom = atom<string>("");

    constructor({ blockId, nodeModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.env = waveEnv;
        this.blockAtom = this.env.wos.getWaveObjectAtom<Block>("block:" + blockId);
        this.appNameAtom = this.env.getBlockMetaKeyAtom(blockId, "appstream:appname" as keyof MetaType) as Atom<string>;
        this.appIdAtom = this.env.getBlockMetaKeyAtom(blockId, "appstream:appid" as keyof MetaType) as Atom<string>;
        this.viewName = atom("App Stream");
    }

    get viewComponent(): ViewComponent {
        return AppStreamView;
    }

    giveFocus(): boolean {
        return true;
    }

    dispose() {
        this.releaseNativeMediaStream();
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (streamUrl) {
            RpcApi.AppStreamStopCommand(TabRpcClient, { sessionId: this.blockId }).catch(() => {});
        }
    }

    async startStream(useNativeSurfaceV2 = false): Promise<void> {
        this.releaseNativeMediaStream();
        globalStore.set(this.statusAtom, "starting");
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.captureFallbackReasonAtom, "");
        const appName = globalStore.get(this.appNameAtom) || "Unknown";
        const bundleId = globalStore.get(this.appIdAtom) || "";
        try {
            if (getApi().isProductivityAppAllowed && !(await getApi().isProductivityAppAllowed({ name: appName, identifier: bundleId }))) {
                throw new Error("This application is blocked during your focus session. Pause focus to open it.");
            }
            const response = await RpcApi.AppStreamStartCommand(TabRpcClient, {
                sessionId: this.blockId,
                appName: appName,
                bundleId,
            });
            if (response.error) {
                globalStore.set(this.statusAtom, "error");
                globalStore.set(this.errorAtom, response.error);
                return;
            }
            globalStore.set(this.streamUrlAtom, response.streamUrl);
            if (useNativeSurfaceV2) {
                await this.startNativeMediaCapture(appName, bundleId);
            }
            globalStore.set(this.statusAtom, "streaming");
        } catch (e) {
            globalStore.set(this.statusAtom, "error");
            globalStore.set(this.errorAtom, String(e));
        }
    }

    async stopStream(): Promise<void> {
        this.releaseNativeMediaStream();
        try {
            await RpcApi.AppStreamStopCommand(TabRpcClient, { sessionId: this.blockId });
        } catch {}
        globalStore.set(this.streamUrlAtom, "");
        globalStore.set(this.statusAtom, "idle");
    }

    private async startNativeMediaCapture(appName: string, appId: string): Promise<void> {
        if (navigator.mediaDevices?.getDisplayMedia == null) {
            globalStore.set(this.captureFallbackReasonAtom, "Live media capture is unavailable in this renderer");
            return;
        }
        try {
            await getApi().prepareNativeSurfaceCapture({ appId, appName });
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 60, min: 30 } },
                audio: false,
            });
            const videoTrack = mediaStream.getVideoTracks()[0];
            if (videoTrack == null) {
                for (const track of mediaStream.getTracks()) {
                    track.stop();
                }
                throw new Error("The selected application did not provide a video track");
            }
            videoTrack.addEventListener(
                "ended",
                () => {
                    if (globalStore.get(this.mediaStreamAtom) !== mediaStream) return;
                    globalStore.set(this.mediaStreamAtom, null);
                    globalStore.set(this.transportAtom, "legacy-snapshot");
                    globalStore.set(
                        this.captureFallbackReasonAtom,
                        "Live capture ended; KronTerm reconnected using compatibility capture"
                    );
                },
                { once: true }
            );
            globalStore.set(this.mediaStreamAtom, mediaStream);
            globalStore.set(this.transportAtom, "native-media");
        } catch (e) {
            globalStore.set(this.mediaStreamAtom, null);
            globalStore.set(this.transportAtom, "legacy-snapshot");
            globalStore.set(this.captureFallbackReasonAtom, e instanceof Error ? e.message : String(e));
        }
    }

    private releaseNativeMediaStream(): void {
        const mediaStream = globalStore.get(this.mediaStreamAtom);
        globalStore.set(this.mediaStreamAtom, null);
        globalStore.set(this.transportAtom, "legacy-snapshot");
        if (mediaStream == null) return;
        for (const track of mediaStream.getTracks()) {
            track.stop();
        }
    }

    async sendClick(x: number, y: number, button?: string): Promise<void> {
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (!streamUrl) return;
        try {
            await fetch(streamUrl + "/click", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ x, y, button: button || "left" }),
            });
        } catch {}
    }

    async sendType(text: string): Promise<void> {
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (!streamUrl) return;
        try {
            await fetch(streamUrl + "/type", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
        } catch {}
    }

    async sendKeyPress(keys: string): Promise<void> {
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (!streamUrl) return;
        try {
            await fetch(streamUrl + "/press_key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keys }),
            });
        } catch {}
    }

    async sendScroll(direction: string, scrollCount?: number): Promise<void> {
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (!streamUrl) return;
        try {
            await fetch(streamUrl + "/scroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction, scrollCount: scrollCount || 3 }),
            });
        } catch {}
    }

    async sendDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
        await this.sendAction("/drag", { fromX, fromY, toX, toY });
    }

    async sendPaste(text: string): Promise<void> {
        await this.sendAction("/paste", { text });
    }

    async waitUntilReady(timeoutMs = 5000): Promise<void> {
        await this.sendAction("/wait", { timeoutMs });
    }

    private async sendAction(path: string, body: Record<string, unknown>): Promise<void> {
        const streamUrl = globalStore.get(this.streamUrlAtom);
        if (!streamUrl) {
            throw new Error("App stream is not connected");
        }
        const response = await fetch(streamUrl + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
            throw new Error(result.error || `App stream action failed (${response.status})`);
        }
    }
}
