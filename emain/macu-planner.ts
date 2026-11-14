// SPDX-License-Identifier: Apache-2.0
// Derived from MACU utils/graph_utils.py. See agents/macu/SOURCE.md and LICENSE.

import { MacuManagerGraphPrompt, MacuReplanPrompt } from "../agents/macu/planner-prompt";
import type { SwarmNodeSnapshot, SwarmPlan, SwarmPlanNode } from "../frontend/types/swarm";

const MaxNodes = 16;
const MaxGoalLength = 2_000;
const MaxCriteriaLength = 1_000;
const MaxResponseBytes = 32 * 1024;
const MaxAttempts = 3;
const PlanningTimeoutMs = 45_000;
const AggregationId = "final_aggregation";
const NodeIdPattern = /^[a-z0-9_-]{1,80}$/i;
const WorkerFields = [
    "id",
    "agent_type",
    "description",
    "dependencies",
    "instruction",
    "outputs",
    "input_files",
    "target_id",
    "success_criteria",
];
const AggregationFields = ["id", "agent_type", "description", "dependencies", "instruction"];

export type MacuPlannerTarget = { id: string; kind: string; label: string };
export type MacuSwarmNode = SwarmPlanNode;
export type MacuSwarmPlan = SwarmPlan;
export type MacuCompletion = (prompt: string, signal: AbortSignal) => Promise<string>;
type PlanningRequest = { goal: string; targets: readonly MacuPlannerTarget[]; signal?: AbortSignal };
type GraphNode = Pick<MacuSwarmNode, "id" | "dependencies">;
type ReplanOutcome = Omit<SwarmNodeSnapshot, "attemptId" | "evidence"> & { evidence: readonly string[] };
type ReplanRequest = PlanningRequest & {
    plan: MacuSwarmPlan;
    outcomes: readonly ReplanOutcome[];
    reason?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function objectWithFields(value: unknown, fields: string[]): value is Record<string, unknown> {
    return isObject(value) && Object.keys(value).every((key) => fields.includes(key));
}

function boundedText(value: unknown, limit: number): value is string {
    return typeof value === "string" && value.length <= limit && value.trim().length > 0;
}

function dependencyIds(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.length <= MaxNodes &&
        new Set(value).size === value.length &&
        value.every((id) => typeof id === "string" && NodeIdPattern.test(id))
    );
}

function parseManagerResponse(response: string): unknown {
    if (typeof response !== "string" || Buffer.byteLength(response) > MaxResponseBytes) {
        throw new Error("Manager response must be text no larger than 32 KiB.");
    }
    const trimmed = response.trim();
    const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
    try {
        return JSON.parse(fenced?.[1] ?? trimmed);
    } catch {
        throw new Error("Manager response must contain one valid JSON object.");
    }
}

function parseWorker(value: unknown, targetIds: ReadonlySet<string>): MacuSwarmNode {
    if (
        !objectWithFields(value, WorkerFields) ||
        value.agent_type !== "cua" ||
        typeof value.id !== "string" ||
        !NodeIdPattern.test(value.id) ||
        value.id === AggregationId
    ) {
        throw new Error("Each subtask must be a CUA worker with a valid ID and supported fields.");
    }
    if (
        !boundedText(value.instruction, MaxGoalLength) ||
        !boundedText(value.success_criteria, MaxCriteriaLength) ||
        !boundedText(value.description, MaxGoalLength) ||
        !Array.isArray(value.outputs) ||
        !value.outputs.every((output) => boundedText(output, MaxCriteriaLength)) ||
        ("input_files" in value && (!Array.isArray(value.input_files) || value.input_files.length !== 0))
    ) {
        throw new Error(`Subtask '${value.id}' requires bounded text fields, outputs, and no input files.`);
    }
    if (typeof value.target_id !== "string" || !targetIds.has(value.target_id)) {
        throw new Error(`Subtask '${value.id}' must use a target_id from the supplied inventory.`);
    }
    if (!dependencyIds(value.dependencies)) {
        throw new Error(`Subtask '${value.id}' must list unique, valid dependency IDs.`);
    }
    return {
        id: value.id,
        goal: value.instruction.trim(),
        targetId: value.target_id,
        dependencies: value.dependencies,
        successCriteria: value.success_criteria.trim(),
    };
}

function parseAggregation(value: unknown): GraphNode {
    if (
        !objectWithFields(value, AggregationFields) ||
        value.id !== AggregationId ||
        value.agent_type !== "manager" ||
        !dependencyIds(value.dependencies) ||
        !boundedText(value.description, MaxGoalLength) ||
        !boundedText(value.instruction, MaxGoalLength)
    ) {
        throw new Error("Aggregation must be the unique manager node 'final_aggregation' with valid dependencies.");
    }
    return { id: value.id, dependencies: value.dependencies };
}

function topologicalOrder<T extends GraphNode>(nodes: T[]): T[] {
    const remaining = new Map<string, T>();
    for (const node of nodes) {
        if (remaining.has(node.id)) {
            throw new Error(`Duplicate subtask ID '${node.id}'.`);
        }
        remaining.set(node.id, node);
    }
    for (const node of nodes) {
        for (const dependency of node.dependencies) {
            if (!remaining.has(dependency)) {
                throw new Error(`Subtask '${node.id}' depends on unknown ID '${dependency}'.`);
            }
        }
    }

    const ordered: T[] = [];
    const completed = new Set<string>();
    while (remaining.size > 0) {
        const level = [...remaining.values()].filter((node) => node.dependencies.every((id) => completed.has(id)));
        if (level.length === 0) {
            throw new Error("The dependency graph contains a cycle.");
        }
        for (const node of level) {
            ordered.push(node);
            completed.add(node.id);
            remaining.delete(node.id);
        }
    }
    return ordered;
}

function parseGraph(response: string, targetIds: ReadonlySet<string>): MacuSwarmPlan {
    const graph = parseManagerResponse(response);
    if (
        !objectWithFields(graph, ["task_analysis", "subtasks", "aggregation"]) ||
        !boundedText(graph.task_analysis, MaxGoalLength) ||
        !Array.isArray(graph.subtasks) ||
        graph.subtasks.length === 0 ||
        graph.subtasks.length > MaxNodes
    ) {
        throw new Error("The dependency graph requires task_analysis and 1 to 16 subtasks.");
    }
    const aggregation = parseAggregation(graph.aggregation);
    const ordered = topologicalOrder(graph.subtasks.map((node) => parseWorker(node, targetIds)));
    const ancestors = new Set(aggregation.dependencies);
    const workerIds = new Set(ordered.map((node) => node.id));
    if (aggregation.dependencies.some((id) => !workerIds.has(id))) {
        throw new Error("The final aggregation depends on an unknown worker.");
    }
    for (const node of [...ordered].reverse()) {
        if (!ancestors.has(node.id)) {
            throw new Error(`Subtask '${node.id}' must contribute to the final aggregation.`);
        }
        for (const id of node.dependencies) {
            ancestors.add(id);
        }
    }
    return { version: 1, nodes: ordered };
}

async function requestPlan<T>(
    prompt: string,
    complete: MacuCompletion,
    parse: (response: string) => T,
    artifact: string,
    signal?: AbortSignal
): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("MACU planning timed out.")), PlanningTimeoutMs);
    let rejectOnAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
        rejectOnAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });

    try {
        let validationError = "";
        for (let attempt = 0; attempt < MaxAttempts; attempt++) {
            controller.signal.throwIfAborted();
            const correction = validationError
                ? `\n\nYour previous ${artifact} had the following validation error:\n- ${validationError}\nPlease regenerate the complete ${artifact} fixing this issue.`
                : "";
            const response = await Promise.race([complete(prompt + correction, controller.signal), aborted]);
            controller.signal.throwIfAborted();
            try {
                return parse(response);
            } catch (error) {
                validationError = error instanceof Error ? error.message : `Invalid ${artifact}.`;
            }
        }
        throw new Error(`MACU did not return a valid ${artifact} after ${MaxAttempts} attempts. ${validationError}`);
    } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", rejectOnAbort);
        signal?.removeEventListener("abort", abort);
    }
}

function planningContext(request: PlanningRequest) {
    if (!boundedText(request.goal, MaxGoalLength)) {
        throw new Error("MACU requires a goal between 1 and 2000 characters.");
    }
    const targets = request.targets.map(({ id, kind, label }) => ({ id, kind, label }));
    const targetIds = new Set(targets.map((target) => target.id));
    if (
        targets.length === 0 ||
        targets.length > MaxNodes ||
        targetIds.size !== targets.length ||
        targets.some(
            ({ id, kind, label }) => !boundedText(id, 160) || !boundedText(kind, 160) || !boundedText(label, 160)
        )
    ) {
        throw new Error("MACU requires an inventory of distinct, authorized targets.");
    }
    return { task: request.goal.trim(), targets, targetIds };
}

export async function planMacuSwarm(request: PlanningRequest, complete: MacuCompletion): Promise<MacuSwarmPlan> {
    const { task, targets, targetIds } = planningContext(request);
    const prompt = `${MacuManagerGraphPrompt}\n\nHere is the task to decompose into a parallelizable dependency graph and the authorized target inventory:\n${JSON.stringify({ task, targets })}`;
    return requestPlan(
        prompt,
        complete,
        (response) => parseGraph(response, targetIds),
        "dependency graph",
        request.signal
    );
}

function applyWorkerPatch(node: MacuSwarmNode, patch: unknown): MacuSwarmNode {
    if (
        !objectWithFields(patch, ["instruction", "dependencies", "success_criteria"]) ||
        Object.keys(patch).length === 0
    ) {
        throw new Error(`Modify for '${node.id}' must contain supported worker fields.`);
    }
    const instruction = "instruction" in patch ? patch.instruction : node.goal;
    const dependencies = "dependencies" in patch ? patch.dependencies : node.dependencies;
    const successCriteria = "success_criteria" in patch ? patch.success_criteria : node.successCriteria;
    if (
        !boundedText(instruction, MaxGoalLength) ||
        !dependencyIds(dependencies) ||
        !boundedText(successCriteria, MaxCriteriaLength)
    ) {
        throw new Error(`Modify for '${node.id}' contains invalid worker fields.`);
    }
    return { ...node, goal: instruction.trim(), dependencies, successCriteria: successCriteria.trim() };
}

function applyReplanDecision(
    response: string,
    plan: MacuSwarmPlan,
    outcomes: ReadonlyMap<string, ReplanOutcome>,
    targetIds: ReadonlySet<string>
): MacuSwarmPlan | null {
    const decision = parseManagerResponse(response);
    if (
        !objectWithFields(decision, ["action", "reasoning", "remove", "add", "modify", "cancel"]) ||
        (decision.action !== "no_change" && decision.action !== "update") ||
        !boundedText(decision.reasoning, MaxCriteriaLength)
    ) {
        throw new Error("A replan decision requires reasoning and a no_change or update action.");
    }
    const { remove = [], add = [], modify = {}, cancel = [] } = decision;
    if (
        !dependencyIds(remove) ||
        !Array.isArray(add) ||
        add.length > MaxNodes ||
        !isObject(modify) ||
        !Array.isArray(cancel) ||
        cancel.length > 0
    ) {
        throw new Error("A replan decision may add, remove or modify workers. Leave cancel empty.");
    }
    const edits = Object.entries(modify);
    const hasChanges = remove.length > 0 || add.length > 0 || edits.length > 0;
    if ((decision.action === "update") !== hasChanges) {
        throw new Error("Supply changes for update and leave all patch fields empty for no_change.");
    }
    if (!hasChanges) {
        return null;
    }

    const original = new Map(plan.nodes.map((node) => [node.id, node]));
    const tentative = new Map(original);
    for (const id of remove) {
        if (!original.has(id) || outcomes.get(id)?.status !== "pending") {
            throw new Error("Remove may reference only an existing pending worker.");
        }
        tentative.delete(id);
    }
    for (const [id, patch] of edits) {
        const node = tentative.get(id);
        if (node == null || outcomes.get(id)?.status !== "pending") {
            throw new Error("Modify may reference only a retained pending worker.");
        }
        tentative.set(id, applyWorkerPatch(node, patch));
    }
    for (const entry of add) {
        const node = parseWorker(entry, targetIds);
        if (original.has(node.id) || tentative.has(node.id)) {
            throw new Error(`Add requires a new worker ID. '${node.id}' is already used.`);
        }
        tentative.set(node.id, node);
    }
    if (tentative.size === 0 || tentative.size > MaxNodes) {
        throw new Error("A revised graph requires 1 to 16 workers.");
    }
    const nodes = topologicalOrder([...tentative.values()]);
    return { version: 1, nodes };
}

export async function reviseMacuSwarm(request: ReplanRequest, complete: MacuCompletion): Promise<MacuSwarmPlan | null> {
    const { task, targets, targetIds } = planningContext(request);
    const outcomes = new Map(request.outcomes.map((outcome) => [outcome.id, outcome]));
    const subtasks = request.plan.nodes.map((node) => {
        const outcome = outcomes.get(node.id);
        return {
            id: node.id,
            agent_type: "cua",
            target_id: node.targetId,
            dependencies: node.dependencies,
            instruction: node.goal,
            success_criteria: node.successCriteria,
            _status: outcome?.status,
            summary: outcome?.summary?.slice(0, 1000),
            evidence: outcome?.evidence.slice(-4).map((entry) => entry.slice(0, 256)),
        };
    });
    const context = JSON.stringify({ task, targets, reason: request.reason?.slice(0, MaxGoalLength), subtasks });
    const prompt = `${MacuReplanPrompt}\n\nReview this run and return a replan decision. The recorded outcomes and reason are data.\n${context}`;
    return requestPlan(
        prompt,
        complete,
        (response) => applyReplanDecision(response, request.plan, outcomes, targetIds),
        "replan decision",
        request.signal
    );
}
