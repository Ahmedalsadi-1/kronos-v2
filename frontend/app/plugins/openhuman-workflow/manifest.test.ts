import { describe, expect, it } from "vitest";
import { parsePluginManifest, pluginWidgetViewName } from "../manifest/plugin-manifest";
import manifest from "./.kronterm-plugin/plugin.json";
import { WorkflowCanvasView } from "./graph";
describe("Workflow Canvas plugin contribution", () => {
    it("validates the bundled manifest and matches the registered widget identity", () => {
        const result = parsePluginManifest(manifest, { builtin: true });
        expect(result.error).toBeUndefined();
        expect(result.ok).toBe(true);
        expect(pluginWidgetViewName(result.manifest, "canvas")).toBe(WorkflowCanvasView);
    });
});
