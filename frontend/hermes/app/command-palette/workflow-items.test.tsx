// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { insertPaletteNode, insertPaletteWidget, useWorkflowPaletteItems } from "./workflow-items";
const Mocks = vi.hoisted(() => ({ close: vi.fn(), scope: { tabId: "tab-a", workflowId: "flow-a" } }));
vi.mock("@hermes/app/workflows/workflow-context", () => ({ useWorkflowContext: () => Mocks.scope }));
vi.mock("@hermes/store/command-palette", () => ({ closeCommandPalette: Mocks.close }));
const previousDesktop = window.hermesDesktop;
afterEach(() => {
    window.hermesDesktop = previousDesktop;
    Mocks.close.mockClear();
    vi.unstubAllGlobals();
});
const catalogNode = { name: "n8n-nodes-base.httpRequest", displayName: "HTTP Request", version: [1, 4, 5] };
const workflow = { id: "flow-a", versionId: "v1", nodes: [{ name: "HTTP Request", position: [20, 40] }] };
function installApi(handler: (body: any) => unknown) {
    const api = vi.fn(async ({ body }) => handler(body));
    window.hermesDesktop = { ...previousDesktop, api: api as unknown as Window["hermesDesktop"]["api"] };
    return api;
}
it("loads real catalog and live widgets only while the palette is open on a saved workflow", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const api = installApi((body) =>
        body.operation === "search-nodes"
            ? [catalogNode]
            : [{ blockId: "browser", label: "Research browser", view: "web" }]
    );
    const host = document.createElement("div");
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Suggestions({ open, query }: { open: boolean; query: string }) {
        const items = useWorkflowPaletteItems(open, query);
        return (
            <>
                {[...items.nodes, ...items.widgets].map((item) => (
                    <button key={item.id} onClick={item.run}>
                        {item.label}
                    </button>
                ))}
            </>
        );
    }
    const render = (open: boolean, query = "") =>
        act(async () => {
            root.render(
                <QueryClientProvider client={client}>
                    <Suggestions open={open} query={query} />
                </QueryClientProvider>
            );
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
    try {
        await render(false);
        expect(api).not.toHaveBeenCalled();
        await render(true);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(host.textContent).toContain("HTTP Request");
        expect(host.textContent).toContain("Research browser");
        await render(true, "http");
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({ body: { operation: "search-nodes", query: "http" } })
        );
        await render(false, "unqueried");
        expect(api.mock.calls.some(([request]) => request.body.query === "unqueried")).toBe(false);
    } finally {
        await act(async () => root.unmount());
        client.clear();
    }
});
it("adds the real node type using canonical version checks and preserves existing graph nodes", async () => {
    const api = installApi((body) => {
        if (body.operation === "get-node")
            return { ...catalogNode, defaultVersion: 4, defaults: { name: "HTTP Request" } };
        if (body.operation === "get-workflow") return workflow;
        return { workflow: { ...workflow, versionId: "v2" } };
    });
    await insertPaletteNode(catalogNode, "flow-a", () => true);
    const write = api.mock.calls.find(([request]) => request.body.operation === "edit-workflow")[0].body;
    expect(write.workflowId).toBe("flow-a");
    expect(write.expectedVersionId).toBe("v1");
    expect(write.edits).toHaveLength(1);
    expect(write.edits[0]).toMatchObject({
        action: "add-node",
        node: { name: "HTTP Request 2", type: catalogNode.name, typeVersion: 4, position: [260, 40], parameters: {} },
    });
    expect(workflow.nodes).toHaveLength(1);
});
it("does not write after the selected workflow changes and preserves backend dirty/version errors", async () => {
    const api = installApi((body) => (body.operation === "get-node" ? catalogNode : workflow));
    await expect(insertPaletteNode(catalogNode, "flow-a", () => false)).rejects.toThrow("selected workflow changed");
    expect(api.mock.calls.some(([request]) => request.body.operation === "edit-workflow")).toBe(false);
    installApi((body) => {
        if (body.operation === "get-node") return catalogNode;
        if (body.operation === "get-workflow") return workflow;
        throw new Error("Save the current workflow edits first.");
    });
    await expect(insertPaletteNode(catalogNode, "flow-a", () => true)).rejects.toThrow(
        "Save the current workflow edits first"
    );
});
it("uses the existing scoped widget insertion acknowledgement instead of creating another widget", async () => {
    let request: any;
    const receive = (event: Event) => {
        request = (event as CustomEvent).detail;
    };
    window.addEventListener("kronterm:workflow-insert-widget", receive);
    try {
        let complete = false;
        const pending = insertPaletteWidget(Mocks.scope, {
            blockId: "browser",
            label: "Research browser",
            view: "web",
        }).then(() => {
            complete = true;
        });
        expect(request).toMatchObject({ tabId: "tab-a", workflowId: "flow-a", blockId: "browser" });
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-widget-inserted", { detail: { ...request, tabId: "other" } })
        );
        await Promise.resolve();
        expect(complete).toBe(false);
        window.dispatchEvent(new CustomEvent("kronterm:workflow-widget-inserted", { detail: request }));
        await pending;
        expect(complete).toBe(true);
    } finally {
        window.removeEventListener("kronterm:workflow-insert-widget", receive);
    }
});
