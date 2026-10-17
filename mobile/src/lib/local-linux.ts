import {
    LocalLinuxRevision,
    type LocalLinuxEntry,
    type LocalLinuxFile,
    type LocalLinuxRequest,
    type LocalLinuxResponse,
    type LocalLinuxState,
} from "./local-linux-protocol";
import { loadLinuxCheckpoint, saveLinuxCheckpoint } from "./local-linux-storage";
import LinuxWorker from "./local-linux-worker?worker&inline";

type WorkerCommand = LocalLinuxRequest extends infer Request
    ? Request extends { id: number }
        ? Omit<Request, "id">
        : never
    : never;

export class LocalLinuxRuntime {
    constructor(private persistent = true) {}
    private state: LocalLinuxState = { phase: "idle", ready: false, output: "", error: "" };
    private listeners = new Set<() => void>();
    private worker?: Worker;
    private sequence = 0;
    private startPromise?: Promise<void>;
    private savePromise?: Promise<void>;
    private bootTimer?: ReturnType<typeof setTimeout>;
    private active = true;
    private resumeAfterBackground = false;
    private pending = new Map<
        number,
        {
            resolve: (message: LocalLinuxResponse & { type: "result" }) => void;
            reject: (reason: Error) => void;
            timer: ReturnType<typeof setTimeout>;
        }
    >();

    getSnapshot = (): LocalLinuxState => this.state;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private update(patch: Partial<LocalLinuxState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((listener) => listener());
    }

    private fail(message: string) {
        clearTimeout(this.bootTimer);
        this.update({ phase: "failed", error: message, ready: false });
        this.worker?.terminate();
        this.worker = undefined;
        for (const entry of this.pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(new Error(message));
        }
        this.pending.clear();
    }

    private request(
        command: WorkerCommand,
        transfers: Transferable[] = []
    ): Promise<LocalLinuxResponse & { type: "result" }> {
        if (!this.worker) return Promise.reject(new Error("Local Linux is unavailable"));
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => {
                    this.pending.delete(id);
                    reject(new Error(`Local Linux ${command.type} timed out`));
                },
                command.type === "start" ? 90_000 : 30_000
            );
            this.pending.set(id, { resolve, reject, timer });
            this.worker!.postMessage({ ...command, id }, transfers);
        });
    }

    start(): Promise<void> {
        if (this.startPromise) return this.startPromise;
        if (this.worker) return Promise.resolve();
        this.update({ phase: "starting", error: "", ready: false });
        this.startPromise = (async () => {
            try {
                if (typeof WebAssembly === "undefined" || typeof Worker === "undefined")
                    throw new Error("This device cannot run the bundled Linux emulator");
                const checkpoint = this.persistent ? await loadLinuxCheckpoint() : undefined;
                this.worker = new LinuxWorker();
                this.worker.onerror = (event) => this.fail(event.message || "Local Linux worker stopped unexpectedly");
                this.worker.onmessage = ({ data }: MessageEvent<LocalLinuxResponse>) => {
                    if (data.type === "output")
                        this.update({ output: (this.state.output + data.text).slice(-100_000) });
                    if (data.type === "phase") {
                        if (data.ready) clearTimeout(this.bootTimer);
                        this.update({ phase: data.phase, ready: data.ready });
                    }
                    if (data.type === "error" && data.id == null) {
                        this.fail(data.message);
                        return;
                    }
                    if (data.type === "error" || data.type === "result") {
                        const pending = this.pending.get(data.id!);
                        if (!pending) return;
                        clearTimeout(pending.timer);
                        this.pending.delete(data.id!);
                        if (data.type === "error") pending.reject(new Error(data.message));
                        else pending.resolve(data);
                    }
                };
                if (checkpoint) this.update({ output: checkpoint.output, savedAt: checkpoint.savedAt });
                this.bootTimer = setTimeout(
                    () => this.fail("Linux did not reach its shell. Your saved checkpoint has been kept."),
                    90_000
                );
                const started = this.request(
                    {
                        type: "start",
                        snapshot: checkpoint?.data,
                        assetBaseURL: new URL(import.meta.env.BASE_URL, window.location.href).href,
                    },
                    checkpoint ? [checkpoint.data] : []
                );
                if (!this.active) void this.request({ type: "pause" }).catch(() => undefined);
                await started;
            } catch (reason) {
                this.fail(reason instanceof Error ? reason.message : String(reason));
                throw reason;
            } finally {
                this.startPromise = undefined;
            }
        })();
        return this.startPromise;
    }

    async input(text: string): Promise<void> {
        if (text.length > 16_384) throw new Error("Send a smaller command to Local Linux");
        await this.request({ type: "input", text });
    }
    async waitUntilReady(): Promise<void> {
        await this.start();
        if (this.state.ready) return;
        await new Promise<void>((resolve, reject) => {
            const unsubscribe = this.subscribe(() => {
                if (!this.state.ready && this.state.phase !== "failed") return;
                unsubscribe();
                if (this.state.ready) resolve();
                else reject(new Error(this.state.error));
            });
        });
    }
    dispose(): void {
        this.fail("Linux sandbox closed");
    }
    async pause(): Promise<void> {
        if (this.worker) await this.request({ type: "pause" });
    }
    async resume(): Promise<void> {
        if (!this.worker) await this.start();
        else await this.request({ type: "resume" });
    }
    async writeFiles(files: LocalLinuxFile[]): Promise<void> {
        if (files.reduce((size, file) => size + file.content.length, 0) > 5_000_000)
            throw new Error("Import fewer than 5 MB of workspace files at a time");
        await this.request({ type: "write-files", files });
    }
    async readFile(path: string): Promise<string> {
        return (await this.request({ type: "read-file", path })).content ?? "";
    }

    async listFiles(path = ""): Promise<LocalLinuxEntry[]> {
        return (await this.request({ type: "list-files", path })).entries ?? [];
    }

    save(): Promise<void> {
        if (!this.persistent) return Promise.reject(new Error("Disposable sandboxes cannot save checkpoints"));
        if (this.savePromise) return this.savePromise;
        this.savePromise = (async () => {
            this.update({ error: "" });
            try {
                const result = await this.request({ type: "save" });
                if (!result.snapshot) throw new Error("Linux did not return a checkpoint");
                const savedAt = Date.now();
                await saveLinuxCheckpoint({
                    revision: LocalLinuxRevision,
                    savedAt,
                    data: result.snapshot,
                    output: this.state.output,
                });
                this.update({ savedAt });
            } catch (reason) {
                this.update({ error: reason instanceof Error ? reason.message : String(reason) });
                throw reason;
            } finally {
                this.savePromise = undefined;
            }
        })();
        return this.savePromise;
    }

    async setActive(active: boolean): Promise<void> {
        if (active === this.active) return;
        this.active = active;
        if (!active) {
            this.resumeAfterBackground = this.state.phase === "running" || this.state.phase === "starting";
            await this.pause();
            if (this.state.ready) await this.save();
        } else if (this.resumeAfterBackground) {
            this.resumeAfterBackground = false;
            await this.resume();
        }
    }
}

export const localLinux = new LocalLinuxRuntime();
