// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { nativeToolManifest, server } from "../src/index.js";
import { WorkflowCommandShape } from "../src/workflow-command-schema.js";

const Graph = {
    version: 1,
    nodes: [
        {
            id: "inspect",
            kind: "terminal",
            title: "Inspect",
            instruction: "Read the project",
            blockId: "terminal",
            engine: "kronoscode",
            outputs: [{ id: "result", type: "text" }],
            position: { x: 10, y: 20 },
        },
        {
            id: "review",
            kind: "review",
            title: "Review",
            instruction: "Review the result",
            engine: "computer",
            inputs: [{ id: "context", type: "text" }],
            position: { x: 300, y: 20 },
        },
    ],
    edges: [{ id: "context", source: "inspect", target: "review", sourcePort: "result", targetPort: "context" }],
};
const Target = {
    workspaceId: "workspace",
    tabId: "tab",
    blockIds: ["terminal"],
    environment: "workspace",
    repository: "/project",
};
const Schema = z.object(WorkflowCommandShape);

test("the registered workflow tool retains complete graph and port contracts on create", async () => {
    const input = {
        action: "create",
        title: "Inspect",
        kind: "automation",
        conversationId: "conversation",
        target: Target,
        parameters: { task: "Inspect" },
        graph: Graph,
    };
    const registered = (server as any)._registeredTools.workflow_run.inputSchema;
    assert.deepEqual(await registered.parseAsync(input), input);
});

test("save-definition preserves editable graph, profiles and positions without starting a run", () => {
    const definition = {
        id: "draft",
        title: "Inspect",
        kind: "automation",
        target: Target,
        parameters: { task: "Inspect" },
        steps: [],
        graph: Graph,
    };
    assert.deepEqual(Schema.parse({ action: "save-definition", definition }), {
        action: "save-definition",
        definition,
    });
    assert.throws(() =>
        Schema.parse({
            action: "save-definition",
            definition: { ...definition, graph: { ...Graph, nodes: [{ ...Graph.nodes[0], engine: "vy" }] } },
        })
    );
    assert.throws(() =>
        Schema.parse({
            action: "create",
            graph: { ...Graph, nodes: [{ ...Graph.nodes[0], outputs: [{ id: "result", type: "image" }] }] },
        })
    );
});

test("workflow schedules retain timezone, timing, pause and missed-run policy", () => {
    const schedule = {
        id: "schedule",
        workflowId: "workflow",
        conversationId: "conversation",
        timezone: "America/New_York",
        intervalMinutes: 30,
        startAt: 1791840000000,
        enabled: false,
        missedRunPolicy: "run-once",
    };
    assert.deepEqual(Schema.parse({ action: "upsert-schedule", schedule }), { action: "upsert-schedule", schedule });
    assert.deepEqual(Schema.parse({ action: "delete-schedule", scheduleId: "schedule" }), {
        action: "delete-schedule",
        scheduleId: "schedule",
    });
    assert.throws(() => Schema.parse({ action: "upsert-schedule", schedule: { ...schedule, intervalMinutes: 0 } }));
});

test("Hermes receives graph and schedule definitions in the native manifest", () => {
    const tool = nativeToolManifest(() => true).find((entry) => entry.name === "workflow_run");
    assert.ok(tool);
    const schema = tool.inputSchema as { properties: Record<string, any> };
    assert.ok(schema.properties.graph.properties.nodes.items.properties.outputs);
    assert.ok(schema.properties.definition.properties.graph);
    assert.ok(schema.properties.schedule.properties.timezone);
    assert.ok(schema.properties.action.enum.includes("save-definition"));
    assert.ok(schema.properties.action.enum.includes("upsert-schedule"));
    assert.ok(schema.properties.expectedVersion);
});

test("launch nodes and compiled steps retain widget environment fields", () => {
    const launch = { view: "web", root: "/project", url: "https://example.com", connection: "ssh:host" };
    const node = { id: "launch", kind: "launch", title: "Open browser", instruction: "Open browser", launch };
    const input = {
        action: "create",
        graph: { version: 1, nodes: [node], edges: [] },
        steps: [
            {
                id: node.id,
                title: node.title,
                instruction: node.instruction,
                dependsOn: [],
                nodeKind: "launch",
                launch,
            },
        ],
    };
    assert.deepEqual(Schema.parse(input), input);
    assert.throws(() =>
        Schema.parse({ ...input, graph: { ...input.graph, nodes: [{ ...node, launch: { view: "shell" } }] } })
    );
});
