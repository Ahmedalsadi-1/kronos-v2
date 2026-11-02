// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type N8nWorkflowDraft = {
    id?: string;
    name: string;
    versionId?: string;
    nodes: {
        id: string;
        name: string;
        type: string;
        typeVersion: number;
        position: number[];
        parameters: Record<string, unknown>;
        [key: string]: unknown;
    }[];
    connections: Record<string, Record<string, { node: string; type: string; index: number }[][]>>;
    settings?: Record<string, unknown>;
};

const ReservedKeys = new Set(["__proto__", "constructor", "prototype"]);

export function validateN8nDraft(workflow: N8nWorkflowDraft): string[] {
    const errors: string[] = [];
    if (!workflow || typeof workflow.name !== "string" || !workflow.name.trim()) return ["Workflow requires a name."];
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length > 1000)
        return ["Workflow nodes must be an array of up to 1000 nodes."];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const node of workflow.nodes) {
        if (!node || typeof node !== "object") {
            errors.push("Workflow contains an invalid node.");
            continue;
        }
        if (!node.id || ids.has(node.id)) errors.push(`Duplicate or missing node ID: ${node.id}`);
        if (!node.name || names.has(node.name) || ReservedKeys.has(node.name))
            errors.push(`Invalid, duplicate, or missing node name: ${node.name}`);
        if (!node.type || !Number.isFinite(node.typeVersion))
            errors.push(`Node ${node.name} requires a type and version.`);
        if (
            !Array.isArray(node.position) ||
            node.position.length !== 2 ||
            node.position.some((value) => !Number.isFinite(value))
        )
            errors.push(`Node ${node.name} requires a canvas position.`);
        if (!node.parameters || Array.isArray(node.parameters) || typeof node.parameters !== "object")
            errors.push(`Node ${node.name} requires parameters.`);
        ids.add(node.id);
        names.add(node.name);
    }
    if (!workflow.connections || typeof workflow.connections !== "object" || Array.isArray(workflow.connections))
        return [...errors, "Invalid workflow connections."];
    for (const [source, ports] of Object.entries(workflow.connections)) {
        if (!names.has(source) || ReservedKeys.has(source)) errors.push(`Connection source is missing: ${source}`);
        if (!ports || typeof ports !== "object" || Array.isArray(ports)) {
            errors.push(`Invalid ports for ${source}`);
            continue;
        }
        for (const outputs of Object.values(ports)) {
            if (!Array.isArray(outputs)) {
                errors.push(`Invalid outputs for ${source}`);
                continue;
            }
            for (const links of outputs) {
                if (!Array.isArray(links)) {
                    errors.push(`Invalid links for ${source}`);
                    continue;
                }
                for (const link of links) {
                    if (!link || !names.has(link.node) || !link.type || !Number.isInteger(link.index) || link.index < 0)
                        errors.push(`Invalid connection from ${source}`);
                }
            }
        }
    }
    return errors;
}

export type N8nBuilderEdit =
    | { action: "add-node"; node: N8nWorkflowDraft["nodes"][number] }
    | { action: "move-node"; name: string; position: number[] }
    | { action: "remove-node"; name: string }
    | { action: "rename-node"; name: string; newName: string }
    | { action: "update-node"; name: string; parameters: Record<string, unknown> }
    | {
          action: "connect" | "disconnect";
          source: string;
          target: string;
          port?: string;
          output?: number;
          input?: number;
      };

export function editN8nDraft(workflow: N8nWorkflowDraft, edits: N8nBuilderEdit[]): N8nWorkflowDraft {
    if (!Array.isArray(edits) || !edits.length || edits.length > 100)
        throw new Error("Provide between 1 and 100 edits.");
    const result = structuredClone(workflow);
    for (const edit of edits) {
        if (edit.action === "add-node") {
            result.nodes.push(structuredClone(edit.node));
            continue;
        }
        if (edit.action === "connect" || edit.action === "disconnect") {
            const port = edit.port ?? "main";
            const output = edit.output ?? 0;
            const input = edit.input ?? 0;
            if (
                !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(port) ||
                ReservedKeys.has(port) ||
                ReservedKeys.has(edit.source) ||
                !Number.isInteger(output) ||
                output < 0 ||
                output > 100 ||
                !Number.isInteger(input) ||
                input < 0 ||
                input > 100
            )
                throw new Error("Invalid connector port.");
            const ports = (result.connections[edit.source] ??= {});
            const outputs = (ports[port] ??= []);
            while (outputs.length <= output) outputs.push([]);
            outputs[output] = outputs[output].filter((link) => !(link.node === edit.target && link.index === input));
            if (edit.action === "connect") outputs[output].push({ node: edit.target, type: port, index: input });
            continue;
        }
        if (!("name" in edit)) throw new Error("Unknown builder edit.");
        const node = result.nodes.find((entry) => entry.name === edit.name);
        if (!node) throw new Error(`Node not found: ${edit.name}`);
        if (edit.action === "move-node") {
            node.position = edit.position;
        } else if (edit.action === "update-node") {
            if (!edit.parameters || typeof edit.parameters !== "object" || Array.isArray(edit.parameters))
                throw new Error("Node parameters must be an object.");
            node.parameters = { ...node.parameters, ...edit.parameters };
        } else if (edit.action === "remove-node") {
            result.nodes = result.nodes.filter((entry) => entry !== node);
            delete result.connections[edit.name];
            for (const ports of Object.values(result.connections))
                for (const [port, outputs] of Object.entries(ports))
                    ports[port] = outputs.map((links) => links.filter((link) => link.node !== edit.name));
        } else if (edit.action === "rename-node") {
            if (
                !edit.newName ||
                ReservedKeys.has(edit.newName) ||
                result.nodes.some((entry) => entry !== node && entry.name === edit.newName)
            )
                throw new Error("Node name must be valid and unique.");
            node.name = edit.newName;
            if (result.connections[edit.name]) {
                result.connections[edit.newName] = result.connections[edit.name];
                delete result.connections[edit.name];
            }
            for (const ports of Object.values(result.connections))
                for (const outputs of Object.values(ports))
                    for (const links of outputs)
                        for (const link of links) if (link.node === edit.name) link.node = edit.newName;
        } else throw new Error("Unknown builder edit.");
    }
    const errors = validateN8nDraft(result);
    if (errors.length) throw new Error(errors.join("\n"));
    return result;
}
