import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { N8nWorkspaceStore } from "./n8n-workspace-store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "n8n-folders-"));
const context = { workspaceId: "workspace", tabId: "tab" };
afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

it("persists folder organization in Hermes and keeps workflow selection when a folder is removed", () => {
    const store = new N8nWorkspaceStore(root);
    const first = store.command(context, { action: "create-folder", name: "Research" });
    const id = first.folders[0].id;
    store.command(context, { action: "move-workflow", workflowId: "workflow-1", folderId: id });
    store.command(context, { action: "select-workflow", workflowId: "workflow-1" });
    expect(new N8nWorkspaceStore(root).read(context).folders[0].workflowIds).toEqual(["workflow-1"]);
    store.command(context, { action: "delete-folder", folderId: id });
    expect(store.read(context)).toEqual({ folders: [], selectedWorkflowId: "workflow-1" });
    expect(store.read({ ...context, tabId: "another-tab" })).toEqual({ folders: [] });
});

it("rejects invalid names, IDs, and unknown folders before changing the index", () => {
    const store = new N8nWorkspaceStore(root);
    expect(() => store.command(context, { action: "create-folder", name: "\n" })).toThrow("folder name");
    expect(() => store.command(context, { action: "select-workflow", workflowId: "../../file" })).toThrow("ID");
    expect(() =>
        store.command(context, { action: "move-workflow", workflowId: "workflow", folderId: "missing" })
    ).toThrow("no longer");
    expect(store.read(context)).toEqual({ folders: [] });
});
