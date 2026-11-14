// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function writeN8nWidgetNodes(directory: string, bridgeFile: string, widgets: Record<string, any>): void {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const filename of fs.readdirSync(directory)) {
        if (/^KronTermWidget[a-f0-9]{12}\.node\.js$/.test(filename)) fs.unlinkSync(path.join(directory, filename));
    }
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "commonjs", private: true }), {
        mode: 0o600,
    });
    for (const [key, widget] of Object.entries(widgets ?? {}).slice(0, 300)) {
        if (!widget || typeof widget !== "object") continue;
        const id = createHash("sha256").update(key).digest("hex").slice(0, 12);
        const className = `KronTermWidget${id}`;
        const title = String(widget["display:name"] || widget["display:label"] || widget.label || key).slice(0, 160);
        const description = {
            displayName: `KronOS: ${title}`,
            name: `kronTermWidget${id}`,
            version: 1,
            group: ["transform"],
            description: `Launch the configured ${title} widget in this workflow's workspace`,
            defaults: { name: title },
            inputs: ["main"],
            outputs: ["main"],
            usableAsTool: true,
            properties: [{ displayName: "Magnify", name: "magnified", type: "boolean", default: false }],
        };
        const source = `const { callTool, toolOutput } = require(${JSON.stringify(bridgeFile)});
class ${className} {
    description = ${JSON.stringify(description)};
    async execute() {
        const output = [];
        for (let index = 0; index < this.getInputData().length; index++) {
            const result = await callTool("trigger_widget", { widgetKey: ${JSON.stringify(key)}, magnified: this.getNodeParameter("magnified", index, false) });
            output.push({ json: { ...toolOutput(result), result }, pairedItem: { item: index } });
        }
        return [output];
    }
}
exports.${className} = ${className};
`;
        fs.writeFileSync(path.join(directory, `${className}.node.js`), source, { mode: 0o600 });
    }
}
