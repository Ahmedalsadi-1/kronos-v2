import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type ToolTarget = { targetWorkspaceId?: string; targetTabId?: string; blockId?: string };
export type ToolOperation = {
    requestId: string;
    name: string;
    deadline: number;
    signal: AbortSignal;
    readOnly: boolean;
    attempts: number;
    routingMs?: number;
    rpcMs?: number;
    target?: { workspaceId?: string; tabId?: string; blockId?: string };
    transport?: string;
    presentation?: string;
    failure?: { code: string; retryable: boolean; uncertain: boolean };
};
export const ToolOperationContext = new AsyncLocalStorage<ToolOperation>();

export function toolTimeoutMs(name: string, args: Record<string, unknown>, readOnly: boolean): number {
    if (name.startsWith("kron_computer_background_workspace_")) return 120_000;
    if (name === "acp_run_agent") return Math.min(600, Math.max(15, Number(args.timeoutSeconds) || 180)) * 1000 + 5000;
    if (name === "linux_desktop_start" || name === "sandbox_task_start") return 180_000;
    if (name === "widget_wait_for") return Math.min(60_000, Math.max(100, Number(args.timeoutMs) || 10_000)) + 2000;
    return readOnly ? 10_000 : 30_000;
}

export class ToolFailure extends Error {
    constructor(
        public code: string,
        message: string,
        public retryable = false,
        public uncertain = false
    ) {
        super(message);
    }
}

export function normalizeToolResult(result: any): any {
    let failure: unknown;
    if (result?.success === false || result?.error) failure = result.error ?? result.message ?? "Action failed";
    for (const item of result?.content ?? []) {
        if (item.type !== "text") continue;
        try {
            const parsed = JSON.parse(item.text);
            if (parsed?.success === false || parsed?.met === false || parsed?.error)
                failure = parsed.error ?? parsed.message ?? "Action failed";
        } catch {
            /* Plain text is a valid tool result. */
        }
    }
    return failure ? { ...result, isError: true } : result;
}

const Diagnostics: Record<string, unknown>[] = [];
export function toolExecutionDiagnostics() {
    const groups = new Map<string, Record<string, any>>();
    for (const sample of Diagnostics) {
        const key = JSON.stringify([
            sample.tool,
            sample.transport ?? "unknown",
            sample.presentation ?? "model-or-unknown",
        ]);
        const group = groups.get(key) ?? {
            tool: sample.tool,
            transport: sample.transport ?? "unknown",
            presentation: sample.presentation ?? "model-or-unknown",
            durations: [],
            failures: 0,
        };
        group.durations.push(sample.durationMs);
        if (sample.outcome === "error") group.failures++;
        groups.set(key, group);
    }
    const summary = [...groups.values()].map((group) => {
        const samples = group.durations.sort((a: number, b: number) => a - b);
        return {
            tool: group.tool,
            transport: group.transport,
            presentation: group.presentation,
            calls: samples.length,
            failures: group.failures,
            medianMs: samples[Math.floor(samples.length * 0.5)],
            p95Ms: samples[Math.floor(samples.length * 0.95)],
        };
    });
    return { samples: Diagnostics.slice(), summary };
}

export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    readOnly: boolean,
    operation: () => Promise<any>,
    externalSignal?: AbortSignal
): Promise<any> {
    const start = performance.now();
    const controller = new AbortController();
    const budget = toolTimeoutMs(name, args, readOnly);
    const context: ToolOperation = {
        requestId: randomUUID(),
        name,
        deadline: Date.now() + budget,
        signal: controller.signal,
        readOnly,
        attempts: 0,
    };
    let timer: ReturnType<typeof setTimeout>;
    let result: any;
    let onAbort: () => void;
    const interrupted = new Promise((_, reject) => {
        onAbort = () => {
            controller.abort();
            reject(new ToolFailure("CANCELLED", `${name} was cancelled`, false, !readOnly));
        };
        externalSignal?.addEventListener("abort", onAbort, { once: true });
    });
    try {
        if (externalSignal?.aborted) throw new ToolFailure("CANCELLED", `${name} was cancelled before execution`);
        result = await ToolOperationContext.run(context, () =>
            Promise.race([
                operation().then(normalizeToolResult),
                interrupted,
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(
                            new ToolFailure(
                                "DEADLINE_EXCEEDED",
                                `${name} exceeded its ${budget / 1000}s deadline`,
                                readOnly,
                                !readOnly
                            )
                        );
                    }, budget);
                }),
            ])
        );
        if (result?.isError) {
            result = {
                ...result,
                _meta: {
                    ...result._meta,
                    failure: {
                        code: context.failure?.code ?? "ACTION_FAILED",
                        outcome: context.failure?.uncertain ? "uncertain" : "failed",
                        requestId: context.requestId,
                        retryable: context.failure?.retryable ?? false,
                        target: context.target ?? {
                            workspaceId: args.targetWorkspaceId,
                            tabId: args.targetTabId,
                            blockId: args.blockId,
                        },
                        recovery:
                            "Inspect current target state before retrying. Refresh inventory if the target is unavailable.",
                    },
                },
            };
        }
        if (result?.isError && result._meta?.failure) {
            result.content = [...(result.content ?? []), { type: "text", text: JSON.stringify(result._meta.failure) }];
        }
        return result;
    } catch (error) {
        const failure =
            error instanceof ToolFailure
                ? error
                : new ToolFailure("TOOL_FAILED", error instanceof Error ? error.message : String(error));
        result = {
            isError: true,
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        code: failure.code,
                        message: failure.message,
                        requestId: context.requestId,
                        target: context.target ?? {
                            workspaceId: args.targetWorkspaceId,
                            tabId: args.targetTabId,
                            blockId: args.blockId,
                        },
                        retryable: failure.retryable,
                        outcome: failure.uncertain ? "uncertain" : "failed",
                        recovery: failure.uncertain
                            ? "Inspect target state before repeating the action; it may have completed."
                            : "Refresh workspace_inventory and workspace_snapshot, then resolve an available target.",
                    }),
                },
            ],
        };
        return result;
    } finally {
        clearTimeout(timer!);
        externalSignal?.removeEventListener("abort", onAbort!);
        Diagnostics.push({
            requestId: context.requestId,
            tool: name,
            durationMs: performance.now() - start,
            budgetMs: budget,
            attempts: context.attempts,
            routingMs: context.routingMs,
            rpcMs: context.rpcMs,
            target: context.target,
            transport: context.transport,
            presentation: context.presentation,
            outcome: result?.isError ? "error" : "success",
        });
        if (Diagnostics.length > 100) Diagnostics.shift();
    }
}
