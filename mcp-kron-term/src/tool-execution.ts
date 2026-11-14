import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type ToolTarget = { targetWorkspaceId?: string; targetTabId?: string; blockId?: string };
export type ToolOperation = {
    requestId: string;
    name: string;
    deadline: number;
    signal: AbortSignal;
    readOnly: boolean;
    tracksSettlement?: boolean;
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
    if (["workspace_design_editor_state", "workspace_design_execute", "workspace_design_read_skill", "workspace_design_save"].includes(name))
        return 90_000;
    if (name.startsWith("comfyui_")) return 35_000;
    if (name.startsWith("sandbox_vm_")) return name === "sandbox_vm_status" ? 30_000 : 120_000;
    if (name === "swarm_start" || name === "swarm_replan") return 120_000;
    if (name.startsWith("kron_computer_")) return 125_000;
    if (
        ["linux_desktop_exec", "linux_desktop_apps", "linux_desktop_launch_app", "linux_desktop_open_url"].includes(
            name
        )
    )
        return 100_000;
    if (name === "sandbox_task_finish") return 60_000;
    if (name.startsWith("linux_desktop_") && name !== "linux_desktop_start") return 60_000;
    if (name === "acp_run_agent" || name === "n8n_run_agent") return Math.min(600, Math.max(15, Number(args.timeoutSeconds) || 180)) * 1000 + 5000;
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

function explicitToolFailure(value: any): boolean {
    return (
        value != null &&
        typeof value === "object" &&
        (value.success === false ||
            value.ok === false ||
            value.met === false ||
            value.isError === true ||
            Boolean(value.error))
    );
}

export function normalizeToolResult(result: any): any {
    let failed = explicitToolFailure(result) || explicitToolFailure(result?.structuredContent);
    for (const item of result?.content ?? []) {
        if (item.type !== "text") continue;
        try {
            failed ||= explicitToolFailure(JSON.parse(item.text));
        } catch {
            /* Page text and command output are not failure envelopes. */
        }
    }
    return failed ? { ...result, isError: true } : result;
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
    externalSignal?: AbortSignal,
    trackOperation?: (operation: Promise<unknown>) => void
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
        tracksSettlement: trackOperation != null,
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
        result = await ToolOperationContext.run(context, () => {
            const running = operation();
            trackOperation?.(running);
            return Promise.race([
                running.then(normalizeToolResult),
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
            ]);
        });
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
