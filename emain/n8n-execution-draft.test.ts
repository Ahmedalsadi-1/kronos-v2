// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { makeN8nExecutionDraft } from "./n8n-execution-draft";

const Source = {
    name: "Product updates",
    nodes: [
        { id: "a", name: "Source", parameters: {}, type: "webhook", typeVersion: 1, position: [0, 0] },
        { id: "b", name: "Map", parameters: {}, type: "n8n-nodes-base.set", typeVersion: 1, position: [200, 0] },
        {
            id: "c",
            name: "Send",
            parameters: {},
            credentials: { mail: { id: "private" } },
            type: "mail",
            typeVersion: 1,
            position: [400, 0],
        },
    ],
    connections: {
        Source: { main: [[{ node: "Map", type: "main", index: 0 }]] },
        Map: { main: [[{ node: "Send", type: "main", index: 0 }]] },
    },
};
const data = {
    resultData: {
        lastNodeExecuted: "Map",
        error: { message: "Missing field" },
        runData: {
            Source: [
                { data: { main: [[{ json: { stale: true } }]] } },
                { data: { main: [null, [{ json: { id: 2 } }]] } },
            ],
            Map: [{ source: [{ previousNode: "Source", previousNodeRun: 1, previousNodeOutput: 1 }] }],
        },
    },
};

it("isolates the failed historical mapping against its actual input and leaves the source unchanged", () => {
    const { draft, runnable, itemCount } = makeN8nExecutionDraft("7", Source, data);
    expect(runnable).toBe(true);
    expect(itemCount).toBe(1);
    expect(draft.pinData).toEqual({ "Recorded input": [{ json: { id: 2 } }] });
    expect(draft.connections).toEqual({
        Source: { main: [[]] },
        "Recorded input": { main: [[{ node: "Map", type: "main", index: 0 }]] },
    });
    expect(draft.nodes.find((node) => node.id === "a")).toHaveProperty("disabled", true);
    expect(draft.nodes.find((node) => node.id === "b")).toHaveProperty("disabled", false);
    expect(draft.nodes.find((node) => node.id === "c")).not.toHaveProperty("credentials");
    expect(Source.nodes[2].credentials).toEqual({ mail: { id: "private" } });
});

it("keeps effectful failing nodes disabled and detects absent fixtures", () => {
    const execution = {
        resultData: { lastNodeExecuted: "Send" },
        executionData: { nodeExecutionStack: [{ node: { name: "Send" }, data: { main: [[{ json: { id: 2 } }]] } }] },
    };
    const { draft, runnable } = makeN8nExecutionDraft("7", Source, execution);
    expect(runnable).toBe(false);
    expect(draft.nodes.find((node) => node.id === "c")).toHaveProperty("disabled", true);
    expect(() => makeN8nExecutionDraft("7", Source, { resultData: { lastNodeExecuted: "Send" } })).toThrow(
        /JSON input/
    );
});
