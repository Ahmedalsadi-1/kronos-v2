import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { expect, it } from "vitest";
import { writeN8nWidgetNodes } from "./n8n-widget-nodes";

it("creates executable nodes for configured widgets without interpreting widget labels as code", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "n8n-widget-nodes-"));
    try {
        const calls: unknown[] = [];
        writeN8nWidgetNodes(root, "/private/bridge.js", {
            "defwidget@preview": { "display:label": "Files'); throw new Error('bad" },
        });
        const filename = fs.readdirSync(root).find((file) => file.endsWith(".node.js"));
        const exports: Record<string, any> = {};
        vm.runInNewContext(fs.readFileSync(path.join(root, filename), "utf8"), {
            exports,
            require: () => ({
                toolOutput: () => ({}),
                callTool: async (...args: unknown[]) => {
                    calls.push(args);
                    return { ok: true };
                },
            }),
        });
        const Widget = Object.values(exports)[0];
        const widget = new Widget();
        expect(widget.description.usableAsTool).toBe(true);
        expect(widget.description.displayName).toContain("Files');");
        await widget.execute.call({ getInputData: () => [{ json: {} }], getNodeParameter: () => false });
        expect(calls).toEqual([["trigger_widget", { widgetKey: "defwidget@preview", magnified: false }]]);
        writeN8nWidgetNodes(root, "/private/bridge.js", {});
        expect(fs.readdirSync(root).filter((file) => file.endsWith(".node.js"))).toEqual([]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
