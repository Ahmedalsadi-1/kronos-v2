import { describe, expect, test } from "vitest";
import type { WorkflowTarget } from "./workflow";
import {
    compileWorkflowGraph,
    validateWorkflowLaunch,
    workflowExecutionCapabilities,
    workflowNodeInputs,
    type WorkflowGraph,
} from "./workflow-graph";

const Target: WorkflowTarget = { workspaceId: "ws", tabId: "tab", blockIds: ["browser"], environment: "workspace" };
const graph = (): WorkflowGraph => ({
    version: 1,
    nodes: [
        {
            id: "inspect",
            kind: "browser",
            blockId: "browser",
            title: "Inspect",
            instruction: "Inspect",
            outputs: [{ id: "result", type: "text" }],
        },
        {
            id: "verify",
            kind: "agent",
            title: "Verify",
            instruction: "Verify",
            inputs: [{ id: "input", type: "text" }],
        },
    ],
    edges: [{ id: "edge", source: "inspect", target: "verify", sourcePort: "result", targetPort: "input" }],
});

describe("workflow graph execution contract", () => {
    test("compiles data edges to dependencies and binds completed outputs", () => {
        const value = graph();
        const steps = compileWorkflowGraph(value, Target);
        expect(steps[1].dependsOn).toEqual(["inspect"]);
        expect(() => workflowNodeInputs(value, steps, "verify")).toThrow("unavailable");
        steps[0].status = "succeeded";
        steps[0].result = "Observed page evidence";
        expect(workflowNodeInputs(value, steps, "verify")).toEqual({ input: "Observed page evidence" });
    });
    test("rejects cycles, missing ports, duplicate input connections and target escape", () => {
        const cycle = graph();
        cycle.edges.push({ id: "back", source: "verify", target: "inspect" });
        expect(() => compileWorkflowGraph(cycle, Target)).toThrow("cycle");
        const missing = graph();
        missing.edges[0].sourcePort = "missing";
        expect(() => compileWorkflowGraph(missing, Target)).toThrow("missing port");
        const duplicate = graph();
        duplicate.edges.push({ ...duplicate.edges[0], id: "second" });
        expect(() => compileWorkflowGraph(duplicate, Target)).toThrow("one connection");
        const escaped = graph();
        escaped.nodes[0].blockId = "another-workspace";
        expect(() => compileWorkflowGraph(escaped, Target)).toThrow("outside");
    });
    test("computer profile reports its actual implementation capabilities", () => {
        expect(
            workflowExecutionCapabilities({
                id: "a",
                title: "a",
                instruction: "a",
                dependsOn: [],
                status: "pending",
                engine: "computer",
            })
        ).toEqual({
            backend: "computer-loop",
            profile: "computer",
            separateEngine: true,
            structuredOutputs: false,
        });
    });
});

test("launch targets reject unsafe URLs, relative paths, malformed connections and unbounded values", () => {
    expect(() => validateWorkflowLaunch({ view: "web", url: "javascript:alert(1)" })).toThrow();
    expect(() => validateWorkflowLaunch({ view: "web", url: "https://user:pass@example.com" })).toThrow();
    expect(() => validateWorkflowLaunch({ view: "preview", root: "../private" })).toThrow();
    expect(() => validateWorkflowLaunch({ view: "term", connection: "remote\ncommand" })).toThrow();
    expect(() => validateWorkflowLaunch({ view: "term", root: "/" + "a".repeat(4096) })).toThrow();
    expect(() => validateWorkflowLaunch({ view: "preview", root: "/tmp/readme.txt" })).not.toThrow();
});
