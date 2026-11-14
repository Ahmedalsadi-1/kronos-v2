import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { editN8nDraft, validateN8nDraft } from "../../emain/n8n-builder.ts";
import { registerN8nTools, setN8nWorkflowBridge } from "../../mcp-kron-term/dist/n8n-tools.js";

export async function verifyNativeOSWorkflow(origin, cookie, types) {
  const api = async (route, method = "GET", body) => {
    const response = await fetch(new URL(route, origin), {
      method,
      headers: { cookie, "browser-id": "component-fixture", "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    assert.ok(response.ok, `${method} ${route}: ${response.status} ${text.slice(0, 800)}`);
    const result = JSON.parse(text);
    return result.data ?? result;
  };
  const created = await api("/rest/workflows", "POST", {
    name: "Native OS smoke",
    nodes: [
      {
        id: "start",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [80, 180],
        parameters: {},
      },
    ],
    connections: {},
    settings: { executionOrder: "v1" },
  });
  const workflowId = created.id;
  const request = async (operation, input = {}) => {
    const route = `/rest/workflows/${workflowId}`;
    if (operation === "get-node") return types.find((node) => node.name === input.nodeType);
    if (operation === "get-workflow") return api(route);
    if (operation === "edit-workflow") {
      const current = await api(route);
      assert.equal(input.expectedVersionId, current.versionId);
      const edited = editN8nDraft(current, input.edits);
      const workflow = await api(route, "PATCH", {
        name: edited.name,
        nodes: edited.nodes,
        connections: edited.connections,
        settings: edited.settings,
        versionId: input.expectedVersionId,
        expectedChecksum: current.checksum,
      });
      return { workflow };
    }
    if (operation === "validate-workflow") {
      const errors = validateN8nDraft(await api(route));
      return { valid: errors.length === 0, errors };
    }
    if (operation === "run-workflow") return api(`${route}/run`, "POST", { triggerToStartFrom: { name: "Start" } });
    throw new Error(`Unsupported smoke operation ${operation}`);
  };
  const setType = types.find((node) => node.name === "n8n-nodes-base.set");
  assert.ok(setType, "The original Set node must be in the live catalog.");
  const version = Math.max(...(Array.isArray(setType.version) ? setType.version : [setType.version]));
  assert.ok(Number.isFinite(version), "The Set node must expose a valid version.");
  const node = {
    id: "answer",
    name: "Result",
    type: setType.name,
    typeVersion: version,
    position: [380, 180],
    parameters: {},
  };
  let graph = await request("get-workflow");
  graph = (
    await request("edit-workflow", {
      expectedVersionId: graph.versionId,
      edits: [
        { action: "add-node", node },
        {
          action: "update-node",
          name: node.name,
          parameters: {
            assignments: { assignments: [{ id: "answer", name: "answer", type: "number", value: 42 }] },
            options: {},
          },
        },
        { action: "connect", source: "Start", target: node.name },
        { action: "move-node", name: node.name, position: [440, 240] },
      ],
    })
  ).workflow;
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.connections.Start.main[0], [{ node: node.name, type: "main", index: 0 }]);
  assert.deepEqual(graph.nodes.find((entry) => entry.id === node.id).position, [440, 240]);
  const chatGraph = await request("get-workflow");
  const tools = new Map();
  registerN8nTools({ tool: (name, ...definition) => tools.set(name, definition.at(-1)) });
  setN8nWorkflowBridge({ invoke: request });
  try {
    const toolResult = await tools.get("n8n_edit_workflow")(
      {
        workflowId,
        expectedVersionId: chatGraph.versionId,
        edits: [{ action: "rename-node", name: node.name, newName: "Result from Hermes tools" }],
      },
      { signal: new AbortController().signal }
    );
    assert.ok(!toolResult.isError, JSON.stringify(toolResult));
    console.log("Registered Hermes n8n_edit_workflow tool changed the canonical workflow document.");
  } finally {
    setN8nWorkflowBridge(undefined);
  }
  graph = await request("get-workflow");
  assert.equal(graph.connections.Start.main[0][0].node, "Result from Hermes tools");
  const validation = await request("validate-workflow");
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const run = await request("run-workflow");
  assert.ok(run.executionId, `Missing execution ID: ${JSON.stringify(run)}`);
  let execution;
  for (let attempt = 0; attempt < 100; attempt++) {
    execution = await api(`/rest/executions/${run.executionId}?includeData=true`);
    if (["success", "error", "crashed", "canceled"].includes(execution.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(execution.status, "success", JSON.stringify(execution).slice(0, 1500));
  if (typeof execution.data === "string")
    execution.data = createRequire(new URL("./upstream/packages/cli/bin/n8n", import.meta.url))("flatted").parse(
      execution.data
    );
  assert.equal(execution.data.resultData.runData["Result from Hermes tools"][0].data.main[0][0].json.answer, 42);
  console.log(
    `Canonical workflow document → saved typed connection → chat-tool rename → real n8n execution ${run.executionId}: answer=42.`
  );
  return workflowId;
}
