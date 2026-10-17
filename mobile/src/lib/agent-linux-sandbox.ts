import { LocalLinuxRuntime } from "./local-linux";
import { safeGuestPath, type LocalLinuxFile } from "./local-linux-protocol";

export interface SandboxCodeRequest {
    script: string;
    files: LocalLinuxFile[];
    outputPaths: string[];
    signal?: AbortSignal;
}

export interface SandboxCodeResult {
    exitCode: number;
    output: string;
    artifacts: LocalLinuxFile[];
}

export function validateSandboxRequest(request: SandboxCodeRequest): void {
    if (!request.script.trim() || request.script.length > 16_000) throw new Error("Script must be 1–16000 characters");
    if (request.files.length > 100 || request.outputPaths.length > 20) throw new Error("Too many sandbox files");
    const paths = [...request.files.map((file) => file.path), ...request.outputPaths];
    if (paths.some((path) => !safeGuestPath(path) || path.split("/")[0].startsWith(".kron-")))
        throw new Error("Invalid sandbox workspace path");
    if (request.files.reduce((size, file) => size + new TextEncoder().encode(file.content).length, 0) > 1_000_000)
        throw new Error("Sandbox input exceeds 1 MB");
}

let running = false;

// A separate emulator prevents tool code from sharing the user's VM memory, disks, or checkpoint.
export async function runSandboxCode(
    request: SandboxCodeRequest,
    userVM?: LocalLinuxRuntime
): Promise<SandboxCodeResult> {
    validateSandboxRequest(request);
    if (running) throw new Error("Another code sandbox is running");
    if (request.signal?.aborted) throw new Error("Sandbox cancelled");
    running = true;
    const runtime = userVM ?? new LocalLinuxRuntime(false);
    let ended = false;
    const interrupt = () => {
        if (!userVM) runtime.dispose();
        else
            void runtime
                .input("\x03")
                .then(() => runtime.pause())
                .catch(() => undefined);
    };
    const marker = `KRON_EXIT_${crypto.randomUUID().replaceAll("-", "")}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let cancel: (() => void) | undefined;
    try {
        return await new Promise<SandboxCodeResult>((resolve, reject) => {
            cancel = () => {
                reject(new Error("Sandbox cancelled"));
                ended = true;
                interrupt();
            };
            request.signal?.addEventListener("abort", cancel, { once: true });
            timer = setTimeout(() => {
                reject(new Error("Sandbox exceeded its 120 second limit"));
                ended = true;
                interrupt();
            }, 120_000);
            void (async () => {
                await runtime.waitUntilReady();
                if (ended || request.signal?.aborted) throw new Error("Sandbox cancelled");
                if (runtime.getSnapshot().phase === "paused") await runtime.resume();
                await runtime.writeFiles([...request.files, { path: ".kron-script", content: request.script }]);
                if (ended || request.signal?.aborted) throw new Error("Sandbox cancelled");
                const completed = new Promise<number>((done, failed) => {
                    unsubscribe = runtime.subscribe(() => {
                        const state = runtime.getSnapshot();
                        if (state.phase === "failed") failed(new Error(state.error));
                        const match = state.output.match(new RegExp(`${marker}:(\\d+)`));
                        if (match) done(Number(match[1]));
                    });
                });
                void completed.catch(() => undefined);
                await runtime.input(
                    `(cd /mnt && sh /mnt/.kron-script) > /mnt/.kron-output 2>&1; r=$?; head -c 65536 /mnt/.kron-output > /mnt/.kron-bounded; printf '${marker}:%s\\n' "$r"\n`
                );
                const exitCode = await completed;
                unsubscribe?.();
                const output = await runtime.readFile(".kron-bounded");
                const artifacts: LocalLinuxFile[] = [];
                for (const path of request.outputPaths) {
                    const content = await runtime.readFile(path);
                    if (new TextEncoder().encode(content).length > 1_000_000)
                        throw new Error(`Sandbox artifact exceeds 1 MB: ${path}`);
                    artifacts.push({ path, content });
                }
                resolve({ exitCode, output, artifacts });
            })().catch(reject);
        });
    } finally {
        clearTimeout(timer);
        unsubscribe?.();
        if (cancel) request.signal?.removeEventListener("abort", cancel);
        if (!userVM) runtime.dispose();
        running = false;
    }
}

export async function copySandboxArtifacts(result: SandboxCodeResult, destination: LocalLinuxRuntime): Promise<void> {
    if (result.exitCode !== 0) throw new Error("Only successful sandbox output can be copied into the user VM");
    validateSandboxRequest({ script: "true", files: result.artifacts, outputPaths: [] });
    await destination.waitUntilReady();
    await destination.writeFiles(result.artifacts);
}
