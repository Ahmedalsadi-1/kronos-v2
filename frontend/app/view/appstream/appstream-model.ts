import type { BlockNodeModel } from "@/app/block/blocktypes";
import { getApi } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { WaveEnv } from "@/app/waveenv/waveenv";
import { Atom, atom, PrimitiveAtom } from "jotai";
import type { AppStreamInput } from "../../../types/appstream";
import { AppStreamEntry } from "./appstream-entry";

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
    inputErrorAtom = atom("");
    frameSize = { width: 0, height: 0 };
    private inputQueue: Promise<void> = Promise.resolve();
    private captureGeneration = 0;
    private capturePendingGeneration: number;
    private streamQueue: Promise<unknown> = Promise.resolve();

    private streamOperation<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.streamQueue.catch(() => {}).then(operation);
        this.streamQueue = result;
        return result;
    }

    constructor({ blockId, nodeModel, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.env = waveEnv;
        this.blockAtom = this.env.wos.getWaveObjectAtom<Block>("block:" + blockId);
        this.appNameAtom = this.env.getBlockMetaKeyAtom(blockId, "appstream:appname" as keyof MetaType) as Atom<string>;
        this.appIdAtom = this.env.getBlockMetaKeyAtom(blockId, "appstream:appid" as keyof MetaType) as Atom<string>;
        this.viewName = this.appNameAtom;
    }

    get viewComponent(): ViewComponent {
        return AppStreamEntry;
    }

    giveFocus(): boolean {
        return true;
    }

    dispose() {
        this.releaseNativeMediaStream();
        globalStore.set(this.streamUrlAtom, "");
        globalStore.set(this.statusAtom, "idle");
        void this.streamOperation(() => RpcApi.AppStreamStopCommand(TabRpcClient, { sessionId: this.blockId })).catch(
            () => {}
        );
    }

    async startStream(useNativeSurfaceV2 = true): Promise<void> {
        this.releaseNativeMediaStream();
        const generation = this.captureGeneration;
        globalStore.set(this.statusAtom, "starting");
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.captureFallbackReasonAtom, "");
        const appName = globalStore.get(this.appNameAtom) || "Unknown";
        const bundleId = globalStore.get(this.appIdAtom) || "";
        try {
            if (
                getApi().isProductivityAppAllowed &&
                !(await getApi().isProductivityAppAllowed({ name: appName, identifier: bundleId }))
            ) {
                throw new Error("This application is blocked during your focus session. Pause focus to open it.");
            }
            if (generation !== this.captureGeneration) return;
            const response = await this.streamOperation(async () => {
                if (generation !== this.captureGeneration) return;
                const response = await RpcApi.AppStreamStartCommand(TabRpcClient, {
                    sessionId: this.blockId,
                    appName: appName,
                    bundleId,
                });
                if (generation !== this.captureGeneration) {
                    if (!response.error) await RpcApi.AppStreamStopCommand(TabRpcClient, { sessionId: this.blockId });
                    return;
                }
                return response;
            });
            if (!response || generation !== this.captureGeneration) return;
            if (response.error) {
                globalStore.set(this.statusAtom, "error");
                globalStore.set(this.errorAtom, response.error);
                return;
            }
            globalStore.set(this.streamUrlAtom, response.streamUrl);
            if (useNativeSurfaceV2) {
                await this.startNativeMediaCapture(appName, bundleId);
            }
            if (generation !== this.captureGeneration) return;
            globalStore.set(this.statusAtom, "streaming");
        } catch (e) {
            if (generation !== this.captureGeneration) return;
            globalStore.set(this.statusAtom, "error");
            globalStore.set(this.errorAtom, String(e));
        }
    }

    async stopStream(): Promise<void> {
        this.releaseNativeMediaStream();
        const generation = this.captureGeneration;
        try {
            await this.streamOperation(() => RpcApi.AppStreamStopCommand(TabRpcClient, { sessionId: this.blockId }));
        } catch {}
        if (generation !== this.captureGeneration) return;
        globalStore.set(this.streamUrlAtom, "");
        globalStore.set(this.statusAtom, "idle");
    }

    private async startNativeMediaCapture(appName: string, appId: string): Promise<void> {
        if (this.capturePendingGeneration === this.captureGeneration) return;
        if (navigator.mediaDevices?.getDisplayMedia == null) {
            globalStore.set(this.captureFallbackReasonAtom, "Live media capture is unavailable in this renderer");
            return;
        }
        const generation = this.captureGeneration;
        this.capturePendingGeneration = generation;
        try {
            await getApi().prepareNativeSurfaceCapture({ appId, appName });
            if (generation !== this.captureGeneration) return;
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 4096 },
                    height: { ideal: 4096 },
                    frameRate: { ideal: 60 },
                    resizeMode: "none",
                } as MediaTrackConstraints,
                audio: false,
            });
            if (generation !== this.captureGeneration) {
                for (const track of mediaStream.getTracks()) track.stop();
                return;
            }
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
                        "Live capture ended. Retry to reconnect, or choose snapshot mode separately."
                    );
                },
                { once: true }
            );
            globalStore.set(this.mediaStreamAtom, mediaStream);
            globalStore.set(this.transportAtom, "native-media");
        } catch (e) {
            if (generation !== this.captureGeneration) return;
            globalStore.set(this.mediaStreamAtom, null);
            globalStore.set(this.transportAtom, "legacy-snapshot");
            globalStore.set(this.captureFallbackReasonAtom, e instanceof Error ? e.message : String(e));
        } finally {
            if (this.capturePendingGeneration === generation) this.capturePendingGeneration = undefined;
        }
    }

    async retryLiveCapture(): Promise<void> {
        if (globalStore.get(this.statusAtom) !== "streaming" || globalStore.get(this.mediaStreamAtom)) return;
        await this.startNativeMediaCapture(
            globalStore.get(this.appNameAtom) || "Unknown",
            globalStore.get(this.appIdAtom) || ""
        );
    }

    private releaseNativeMediaStream(): void {
        this.captureGeneration++;
        const mediaStream = globalStore.get(this.mediaStreamAtom);
        globalStore.set(this.mediaStreamAtom, null);
        globalStore.set(this.transportAtom, "legacy-snapshot");
        if (mediaStream == null) return;
        for (const track of mediaStream.getTracks()) {
            track.stop();
        }
    }

    async sendClick(x: number, y: number, button = "left"): Promise<void> {
        await this.sendInput({ action: "click", x, y, button: button as AppStreamInput["button"] }, "/click", {
            x,
            y,
            button,
        });
    }

    async sendType(text: string): Promise<void> {
        await this.sendInput({ action: "type", text }, "/type", { text });
    }

    async sendKeyPress(keys: string): Promise<void> {
        await this.sendInput({ action: "press", keys }, "/press_key", { keys });
    }

    async sendScroll(direction: string, scrollCount = 3): Promise<void> {
        await this.sendInput(
            { action: "scroll", direction: direction as AppStreamInput["direction"], pages: scrollCount / 3 },
            "/scroll",
            { direction, scrollCount }
        );
    }

    async sendDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
        await this.sendInput({ action: "drag", x: fromX, y: fromY, toX, toY }, "/drag", { fromX, fromY, toX, toY });
    }

    async sendPaste(text: string): Promise<void> {
        await this.sendType(text);
    }

    private sendInput(
        input: Omit<AppStreamInput, "app">,
        _fallbackPath: string,
        _body: Record<string, unknown>
    ): Promise<void> {
        const generation = this.captureGeneration;
        const request: AppStreamInput = {
            ...input,
            app: globalStore.get(this.appIdAtom) || globalStore.get(this.appNameAtom),
            frameWidth: this.frameSize.width,
            frameHeight: this.frameSize.height,
        };
        const operation = this.inputQueue
            .catch(() => {})
            .then(async () => {
                if (generation !== this.captureGeneration || globalStore.get(this.statusAtom) !== "streaming") return;
                try {
                    if (!getApi().appStreamInput) {
                        throw new Error("Restart KronTerm to load native app input support.");
                    }
                    await getApi().appStreamInput(request);
                    globalStore.set(this.inputErrorAtom, "");
                } catch (error) {
                    globalStore.set(this.inputErrorAtom, error instanceof Error ? error.message : String(error));
                    throw error;
                }
            });
        this.inputQueue = operation;
        return operation;
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
