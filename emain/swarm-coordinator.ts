// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
    SwarmAttemptResult,
    SwarmCreateInput,
    SwarmNodeSnapshot,
    SwarmPlan,
    SwarmPlanNode,
    SwarmRecoveryItem,
    SwarmRunSnapshot,
    SwarmTarget,
} from "../frontend/types/swarm";

const MaxNodes = 16;
const MaxWorkers = 4;
const MaxRuns = 64;
const MaxEvidence = 16;
const MaxJournalBytes = 32 * 1024 * 1024;
const AttemptStatuses = ["succeeded", "failed", "blocked", "cancelled", "uncertain"];
const ActiveRunStatuses = ["draft", "running", "cancelling"];

export type SwarmExecutionContext = {
    run: SwarmRunSnapshot;
    node: SwarmPlanNode;
    target: SwarmTarget;
    attemptId: string;
    signal: AbortSignal;
};

export type SwarmCoordinatorOptions = {
    journalPath: string;
    execute: (context: SwarmExecutionContext) => Promise<SwarmAttemptResult>;
    onError?: (error: unknown) => void;
    hasUnsettledAttempt?: (attemptId: string) => boolean;
};

type Lease = {
    runId: string;
    target: SwarmTarget;
    controller: AbortController;
};

function boundedText(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length <= max && value.trim().length > 0;
}

function validateTargets(targets: SwarmTarget[]): SwarmTarget[] {
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > MaxNodes) {
        throw new Error("Assign between 1 and 16 swarm targets");
    }
    const ids = new Set<string>();
    return targets.map((target) => {
        if (
            !target ||
            !boundedText(target.id, 160) ||
            ids.has(target.id) ||
            !["browser", "widget", "device", "vm"].includes(target.kind) ||
            !boundedText(target.label, 160) ||
            !Number.isSafeInteger(target.generation) ||
            target.generation < 0 ||
            !Array.isArray(target.resourceKeys) ||
            target.resourceKeys.length === 0 ||
            target.resourceKeys.length > 8 ||
            target.resourceKeys.some((key) => !boundedText(key, 256)) ||
            [target.blockId, target.deviceId, target.desktopId, target.tabId].some(
                (id) => id != null && !boundedText(id, 160)
            )
        ) {
            throw new Error("Invalid swarm target or physical resource assignment");
        }
        ids.add(target.id);
        const { id, kind, label, generation, blockId, deviceId, desktopId, tabId } = target;
        return {
            id,
            kind,
            label,
            generation,
            blockId,
            deviceId,
            desktopId,
            tabId,
            resourceKeys: [...new Set(target.resourceKeys)],
        };
    });
}

function validatePlan(plan: SwarmPlan, targets: SwarmTarget[]): SwarmPlan {
    if (plan?.version !== 1 || !Array.isArray(plan.nodes) || !plan.nodes.length || plan.nodes.length > MaxNodes) {
        throw new Error("Use a version 1 swarm plan with 1 to 16 nodes");
    }
    const targetsById = new Set(targets.map((target) => target.id));
    const nodesById = new Map<string, SwarmPlanNode>();
    for (const node of plan.nodes) {
        if (
            !node ||
            !boundedText(node.id, 80) ||
            !/^[a-zA-Z0-9_-]+$/.test(node.id) ||
            nodesById.has(node.id) ||
            !targetsById.has(node.targetId) ||
            !boundedText(node.goal, 2000) ||
            !boundedText(node.successCriteria, 1000) ||
            !Array.isArray(node.dependencies) ||
            node.dependencies.length >= MaxNodes ||
            new Set(node.dependencies).size !== node.dependencies.length
        ) {
            throw new Error(
                "Swarm nodes require unique IDs, assigned targets, goals, success criteria and dependencies"
            );
        }
        const { id, goal, targetId, dependencies, successCriteria } = node;
        nodesById.set(id, { id, goal, targetId, dependencies: [...dependencies].sort(), successCriteria });
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(id: string) {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error("Swarm plan contains a dependency cycle");
        const node = nodesById.get(id);
        if (!node) throw new Error("Swarm dependency refers to an unknown node");
        visiting.add(id);
        for (const dependency of node.dependencies) visit(dependency);
        visiting.delete(id);
        visited.add(id);
    }
    for (const id of nodesById.keys()) visit(id);
    return { version: 1, nodes: [...nodesById.values()] };
}

function pendingNode(id: string): SwarmNodeSnapshot {
    return { id, status: "pending", evidence: [] };
}

function validateConcurrency(concurrency: number): void {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MaxWorkers) {
        throw new Error("Swarm concurrency must be between 1 and 4");
    }
}

function validateMetadata({ ownerId, workspaceId, sessionId, backend, goal }: SwarmCreateInput): void {
    if (
        [ownerId, workspaceId, sessionId, backend].some((value) => value != null && !boundedText(value, 160)) ||
        (goal != null && !boundedText(goal, 2000))
    ) {
        throw new Error("Invalid swarm metadata");
    }
}

function normalizeResult(result: SwarmAttemptResult): SwarmAttemptResult {
    if (
        !result ||
        !AttemptStatuses.includes(result.status) ||
        !boundedText(result.summary, 2000) ||
        !Array.isArray(result.evidence) ||
        result.evidence.length > MaxEvidence ||
        result.evidence.some((entry) => !boundedText(entry, 512))
    ) {
        return { status: "uncertain", summary: "The worker returned an invalid outcome.", evidence: [] };
    }
    if (result.status === "succeeded" && result.evidence.length === 0) {
        return { status: "uncertain", summary: "The worker reported success without evidence.", evidence: [] };
    }
    return { status: result.status, summary: result.summary, evidence: [...result.evidence] };
}

function nodeTarget(run: SwarmRunSnapshot, node: SwarmPlanNode): SwarmTarget {
    return run.targets.find(({ id }) => id === node.targetId);
}

function needsReconciliation(node: SwarmNodeSnapshot): boolean {
    return node.status === "uncertain" && node.reconciledAt == null;
}

function runStatus(run: SwarmRunSnapshot): SwarmRunSnapshot["status"] {
    const statuses = new Set(run.nodes.map((node) => node.status));
    if (run.status === "cancelling" && statuses.has("running")) return "cancelling";
    if (statuses.has("running") || statuses.has("pending")) return "running";
    if (statuses.has("uncertain")) return "uncertain";
    if (run.status === "cancelling") return "cancelled";
    if (statuses.has("failed")) return "failed";
    if (statuses.has("cancelled")) return "cancelled";
    if (statuses.has("blocked")) return "blocked";
    return "succeeded";
}

function readJournal(file: string): SwarmRunSnapshot[] {
    let contents: string;
    try {
        if (fs.statSync(file).size > MaxJournalBytes) throw new Error("Swarm journal exceeds its size limit");
        contents = fs.readFileSync(file, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
    const journal = JSON.parse(contents);
    if (journal?.version !== 1 || !Array.isArray(journal.runs) || journal.runs.length > MaxRuns) {
        throw new Error("Invalid swarm journal");
    }
    const ids = new Set<string>();
    for (const run of journal.runs as SwarmRunSnapshot[]) {
        if (
            !run ||
            !boundedText(run.id, 80) ||
            ids.has(run.id) ||
            !Number.isSafeInteger(run.revision) ||
            run.revision < 1 ||
            ![...ActiveRunStatuses, ...AttemptStatuses].includes(run.status) ||
            !Number.isFinite(run.createdAt) ||
            !Number.isFinite(run.updatedAt)
        ) {
            throw new Error("Invalid run in swarm journal");
        }
        validateMetadata(run);
        validateConcurrency(run.concurrency);
        run.targets = validateTargets(run.targets);
        run.plan = validatePlan(run.plan, run.targets);
        if (
            !Array.isArray(run.nodes) ||
            run.nodes.length !== run.plan.nodes.length ||
            run.nodes.some(
                (node, index) =>
                    !node ||
                    node.id !== run.plan.nodes[index].id ||
                    !["pending", "running", ...AttemptStatuses].includes(node.status) ||
                    (node.attemptId != null && !boundedText(node.attemptId, 80)) ||
                    (node.status === "running" && !node.attemptId) ||
                    (node.reconciledAt != null &&
                        (node.status !== "uncertain" || !Number.isSafeInteger(node.reconciledAt) || node.reconciledAt <= 0)) ||
                    (node.summary != null && !boundedText(node.summary, 2000)) ||
                    !Array.isArray(node.evidence) ||
                    node.evidence.length > MaxEvidence ||
                    node.evidence.some((entry) => !boundedText(entry, 512)) ||
                    (node.status === "succeeded" && (!node.attemptId || !node.evidence.length))
            )
        ) {
            throw new Error("Invalid node in swarm journal");
        }
        ids.add(run.id);
    }
    return journal.runs;
}

function writeJournal(file: string, runs: Iterable<SwarmRunSnapshot>): void {
    const contents = JSON.stringify({ version: 1, runs: [...runs] });
    if (Buffer.byteLength(contents) > MaxJournalBytes) throw new Error("Swarm journal exceeds its size limit");
    const directory = path.dirname(file);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        const fd = fs.openSync(temporary, "wx", 0o600);
        try {
            fs.writeFileSync(fd, contents, "utf8");
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temporary, file);
        if (process.platform !== "win32") {
            const directoryFd = fs.openSync(directory, "r");
            try {
                fs.fsyncSync(directoryFd);
            } finally {
                fs.closeSync(directoryFd);
            }
        }
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

export class SwarmCoordinator {
    private runs = new Map<string, SwarmRunSnapshot>();
    private readonly leases = new Map<string, Lease>();
    private readonly quarantined = new Set<string>();
    private readonly listeners = new Set<(snapshot: SwarmRunSnapshot) => void>();
    private scheduled = false;
    private closed = false;

    constructor(private readonly options: SwarmCoordinatorOptions) {
        let recovered = false;
        for (const run of readJournal(options.journalPath)) {
            if (run.status === "running" || run.status === "cancelling") {
                recovered = true;
                for (const node of run.nodes) {
                    if (node.status === "running") {
                        node.status = "uncertain";
                        node.summary = "The app stopped before the attempt settled.";
                    } else if (node.status === "pending") {
                        node.status = run.status === "cancelling" ? "cancelled" : "blocked";
                        node.summary = "The app stopped before this node started.";
                    }
                }
                run.status = runStatus(run);
                run.updatedAt = Date.now();
            }
            this.runs.set(run.id, run);
        }
        this.refreshQuarantine();
        if (recovered) writeJournal(options.journalPath, this.runs.values());
    }

    create(input: SwarmCreateInput): SwarmRunSnapshot {
        this.assertOpen();
        const { ownerId, workspaceId, sessionId, backend, goal, concurrency = 2 } = input;
        validateConcurrency(concurrency);
        validateMetadata(input);
        const targets = validateTargets(input.targets);
        const plan = validatePlan(input.plan, targets);
        const now = Date.now();
        const run: SwarmRunSnapshot = {
            id: randomUUID(),
            revision: 1,
            status: "draft",
            plan,
            targets,
            concurrency,
            nodes: plan.nodes.map(({ id }) => pendingNode(id)),
            createdAt: now,
            updatedAt: now,
            ownerId,
            workspaceId,
            sessionId,
            backend,
            goal,
        };
        this.commit(run);
        return structuredClone(run);
    }

    start(runId: string): SwarmRunSnapshot {
        this.assertOpen();
        const run = this.getRun(runId);
        if (run.status === "running") return structuredClone(run);
        if (run.status !== "draft") throw new Error("Only a draft swarm can be started");
        const next = { ...run, status: "running" as const, updatedAt: Date.now() };
        this.commit(next);
        this.schedule();
        return structuredClone(next);
    }

    status(runId: string): SwarmRunSnapshot {
        return structuredClone(this.getRun(runId));
    }

    list(): SwarmRunSnapshot[] {
        return Array.from(this.runs.values())
            .reverse()
            .map((run) => structuredClone(run));
    }

    listRecoveries(workspaceId: string, tabId: string): SwarmRecoveryItem[] {
        if (!workspaceId || !tabId) return [];
        return [...this.runs.values()].reverse().flatMap((run) => {
            if (ActiveRunStatuses.includes(run.status)) return [];
            return run.nodes.flatMap((node, index) => {
                if (!needsReconciliation(node) || !node.attemptId) return [];
                const planNode = run.plan.nodes[index];
                const target = nodeTarget(run, planNode);
                if (run.workspaceId ? run.workspaceId !== workspaceId : target.tabId !== tabId) return [];
                return [{
                    runId: run.id,
                    attemptId: node.attemptId,
                    targetLabel: target.label,
                    goal: planNode.goal,
                    summary: node.summary,
                }];
            });
        });
    }

    acknowledge(workspaceId: string, tabId: string, runId: string, attemptId: string): void {
        this.assertOpen();
        if (!this.listRecoveries(workspaceId, tabId).some((item) => item.runId === runId && item.attemptId === attemptId))
            throw new Error("This uncertain swarm attempt is no longer available in this workspace.");
        if (this.options.hasUnsettledAttempt?.(attemptId))
            throw new Error("A tool operation is still settling. Inspect the target and try again when it finishes.");
        const next = structuredClone(this.getRun(runId));
        next.nodes.find((node) => node.attemptId === attemptId).reconciledAt = Date.now();
        next.updatedAt = Date.now();
        this.commit(next);
        this.refreshQuarantine();
        this.schedule();
    }

    private refreshQuarantine(): void {
        this.quarantined.clear();
        for (const run of this.runs.values()) {
            for (const [index, node] of run.nodes.entries()) {
                if (!needsReconciliation(node)) continue;
                for (const key of nodeTarget(run, run.plan.nodes[index]).resourceKeys) this.quarantined.add(key);
            }
        }
    }

    cancel(runId: string): SwarmRunSnapshot {
        this.assertOpen();
        const run = this.getRun(runId);
        if (!["draft", "running"].includes(run.status)) return structuredClone(run);
        const next = structuredClone(run);
        next.status = "cancelling";
        next.updatedAt = Date.now();
        for (const node of next.nodes) {
            if (node.status === "pending") node.status = "cancelled";
        }
        next.status = runStatus(next);
        this.commit(next);
        for (const lease of this.leases.values()) {
            if (lease.runId === runId) lease.controller.abort();
        }
        return structuredClone(next);
    }

    revise(runId: string, expectedRevision: number, proposed: SwarmPlan): SwarmRunSnapshot {
        this.assertOpen();
        const run = this.getRun(runId);
        if (run.revision !== expectedRevision) throw new Error("Swarm plan revision conflict");
        if (run.status === "cancelling" || run.status === "cancelled") throw new Error("The swarm was cancelled");
        const plan = validatePlan(proposed, run.targets);
        const planById = new Map(plan.nodes.map((node) => [node.id, node]));
        const retained = new Map<string, SwarmNodeSnapshot>();
        for (const [index, node] of run.nodes.entries()) {
            if (node.status === "pending") continue;
            if (JSON.stringify(run.plan.nodes[index]) !== JSON.stringify(planById.get(node.id))) {
                throw new Error("A revised swarm plan cannot change or remove a started or completed node");
            }
            retained.set(node.id, node);
        }
        const next = {
            ...run,
            plan,
            nodes: plan.nodes.map(({ id }) => retained.get(id) ?? pendingNode(id)),
            revision: run.revision + 1,
            updatedAt: Date.now(),
        };
        if (next.status !== "running" && next.nodes.some((node) => node.status === "pending")) next.status = "draft";
        this.commit(next);
        if (next.status === "running") this.schedule();
        return structuredClone(next);
    }

    subscribe(listener: (snapshot: SwarmRunSnapshot) => void): () => void {
        this.assertOpen();
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    close(): void {
        this.closed = true;
        this.listeners.clear();
        for (const lease of this.leases.values()) lease.controller.abort();
        this.leases.clear();
    }

    private assertOpen(): void {
        if (this.closed) throw new Error("Swarm coordinator is closed");
    }

    private getRun(id: string): SwarmRunSnapshot {
        const run = this.runs.get(id);
        if (!run) throw new Error("Unknown swarm run");
        return run;
    }

    private commit(run: SwarmRunSnapshot): void {
        const runs = new Map(this.runs).set(run.id, run);
        if (runs.size > MaxRuns) {
            const evict = [...runs.values()].find(
                (candidate) =>
                    candidate.id !== run.id &&
                    !ActiveRunStatuses.includes(candidate.status) &&
                    !candidate.nodes.some(needsReconciliation)
            );
            if (!evict) throw new Error("Swarm history is full with active or unreconciled runs");
            runs.delete(evict.id);
        }
        try {
            writeJournal(this.options.journalPath, runs.values());
        } catch (error) {
            // A failed commit may have reached disk. Stop admitting effects until recovery reads the journal.
            this.close();
            throw error;
        }
        this.runs = runs;
        const listeners = [...this.listeners];
        queueMicrotask(() => {
            for (const listener of listeners) {
                if (!this.listeners.has(listener)) continue;
                try {
                    listener(structuredClone(run));
                } catch (error) {
                    this.options.onError?.(error);
                }
            }
        });
    }

    private schedule(): void {
        if (this.closed || this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            if (this.closed) return;
            try {
                this.pump();
            } catch (error) {
                this.close();
                this.options.onError?.(error);
            }
        });
    }

    private pump(): void {
        const reserved = new Set([...this.leases.values()].flatMap(({ target }) => target.resourceKeys));
        for (const run of this.runs.values()) {
            if (run.status !== "running") continue;
            let slots = run.concurrency - [...this.leases.values()].filter((lease) => lease.runId === run.id).length;
            const next = structuredClone(run);
            const nodes = new Map(next.nodes.map((node) => [node.id, node]));
            const attempts: { node: SwarmPlanNode; target: SwarmTarget; attemptId: string; lease: Lease }[] = [];
            let changed = false;

            for (let repeat = true; repeat;) {
                repeat = false;
                for (const planNode of next.plan.nodes) {
                    const node = nodes.get(planNode.id);
                    if (node.status !== "pending") continue;
                    const target = nodeTarget(next, planNode);
                    const dependencies = planNode.dependencies.map((id) => nodes.get(id).status);
                    if (
                        dependencies.some(
                            (status) => status !== "pending" && status !== "running" && status !== "succeeded"
                        )
                    ) {
                        node.status = "blocked";
                        node.summary = "A dependency did not succeed.";
                    } else if (target.resourceKeys.some((key) => this.quarantined.has(key))) {
                        node.status = "blocked";
                        node.summary = "The target has an unresolved attempt.";
                    } else {
                        if (
                            slots <= 0 ||
                            this.leases.size >= MaxWorkers ||
                            dependencies.some((status) => status !== "succeeded") ||
                            target.resourceKeys.some((key) => reserved.has(key))
                        )
                            continue;

                        const attemptId = randomUUID();
                        const lease = { runId: run.id, target, controller: new AbortController() };
                        for (const key of target.resourceKeys) reserved.add(key);
                        this.leases.set(attemptId, lease);
                        slots--;
                        node.status = "running";
                        node.attemptId = attemptId;
                        attempts.push({ node: planNode, target, attemptId, lease });
                    }
                    repeat = true;
                    changed = true;
                }
            }
            if (!changed) continue;
            next.status = runStatus(next);
            next.updatedAt = Date.now();
            this.commit(next);
            for (const { node, target, attemptId, lease } of attempts) {
                void this.dispatch({
                    run: structuredClone(next),
                    node: structuredClone(node),
                    target: structuredClone(target),
                    attemptId,
                    signal: lease.controller.signal,
                });
            }
        }
    }

    private async dispatch(context: SwarmExecutionContext): Promise<void> {
        // Wait until admission has committed across the pump before entering adapter code.
        await Promise.resolve();
        if (this.closed) return;
        let result: SwarmAttemptResult;
        try {
            result = context.signal.aborted
                ? { status: "cancelled", summary: "Cancelled before dispatch.", evidence: [] }
                : normalizeResult(await this.options.execute(context));
        } catch {
            result = {
                status: "uncertain",
                summary: "The worker stopped without confirming the effect settled.",
                evidence: [],
            };
        }
        if (this.closed) return;
        try {
            this.settle(context.attemptId, result);
        } catch (error) {
            this.close();
            this.options.onError?.(error);
        }
    }

    private settle(attemptId: string, result: SwarmAttemptResult): void {
        const lease = this.leases.get(attemptId);
        const next = structuredClone(this.getRun(lease.runId));
        const node = next.nodes.find((candidate) => candidate.attemptId === attemptId);
        Object.assign(node, result);
        next.status = runStatus(next);
        next.updatedAt = Date.now();
        this.commit(next);
        if (result.status === "uncertain") {
            for (const key of lease.target.resourceKeys) this.quarantined.add(key);
        }
        this.leases.delete(attemptId);
        this.schedule();
    }
}
