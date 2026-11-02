vi.mock("./workflow-account", () => ({
    hasKronTermAccount: () => mocks.account,
    workflowAccount: vi.fn(),
    WorkflowBrowserId: "test-browser",
    forgetWorkflowSession: vi.fn(),
}));
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { N8nWorkspace } from "./n8n-workspace";
import { N8nWorkspaceStore } from "./n8n-workspace-store";

const mocks = vi.hoisted(() => ({
    account: true,
    contents: [] as any[],
    blocks: [] as any[],
    set: vi.fn(),
    focus: vi.fn(),
    create: vi.fn(),
}));
vi.mock("electron", () => ({
    webContents: {
        getAllWebContents: () => mocks.contents,
        fromId: (id: number) => mocks.contents.find((entry) => entry.id === id),
    },
}));
vi.mock("./authkey", () => ({ grantManagedRuntimeRequests: vi.fn() }));
vi.mock("./kronterm-native-tool-bridge", () => ({
    KronTermNativeToolBridge: class {
        listBlocks = async () => JSON.stringify(mocks.blocks);
        listWidgets = async () => JSON.stringify({ widgets: { terminal: { view: "term" } } });
        setBlockMeta = mocks.set;
        focusBlock = mocks.focus;
        createBlock = mocks.create;
    },
}));
const roots: string[] = [];
const context = { workspaceId: "workspace", tabId: "tab" };
const AddedNode = {
    action: "add-node" as const,
    node: {
        id: "start",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
    },
};
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-controller-"));
    roots.push(root);
    const runtime = {
        status: () => ({ running: true, url: "http://127.0.0.1:5678" }),
        assertScope: vi.fn(),
        start: vi.fn(async () => ({ running: true, url: "http://127.0.0.1:5678" })),
    };
    const store = new N8nWorkspaceStore(root);
    const worker = vi.fn(async () => ({ text: "done" }));
    return { runtime, store, worker, workspace: new N8nWorkspace(runtime as any, worker, store) };
}
afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    mocks.account = true;
    mocks.blocks = [];
    mocks.contents = [];
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

it("opens the real editor on the OS desktop without creating or focusing a widget", async () => {
    mocks.account = true;
    const { workspace } = fixture();
    await workspace.command({ operation: "open", surface: "canvas", workflowId: "flow1" }, context);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
        desktop: { surface: "canvas", url: "http://127.0.0.1:5678/workflow/flow1" },
    });
    await workspace.command({ operation: "select-workflow", workflowId: "flow2" }, context);
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
        desktop: { url: "http://127.0.0.1:5678/workflow/flow2" },
    });
    await workspace.command({ operation: "hide-desktop" }, context);
    expect((await workspace.command({ operation: "state" }, context)).desktop).toBeUndefined();
});
it("binds the session browser identity only to the managed editor origin", async () => {
    const { workspace } = fixture();
    const executeJavaScript = vi.fn();
    mocks.contents = [
        { id: 55, getType: () => "webview", getURL: () => "http://127.0.0.1:5678/workflow/flow1", executeJavaScript },
    ];
    await workspace.command({ operation: "attach", webContentsId: 55 }, context);
    expect(executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('"test-browser"'));
    mocks.contents[0].getURL = () => "https://example.com";
    await expect(workspace.command({ operation: "attach", webContentsId: 55 }, context)).rejects.toThrow("Unknown");
});

it("preserves unsaved canvas edits and rejects stale agent versions before writing", async () => {
    const { workspace } = fixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ data: { id: "flow1", versionId: "current", nodes: [], connections: {} } })
    );
    const executeJavaScript = vi.fn(async () => ({ dirty: true }));
    mocks.contents = [
        {
            isDestroyed: () => false,
            getType: () => "webview",
            getURL: () => "http://127.0.0.1:5678/workflow/flow1",
            executeJavaScript,
        },
    ];
    await expect(workspace.command({ operation: "select-workflow", workflowId: "flow2" }, context)).rejects.toThrow(
        "Save the current"
    );
    expect(mocks.set).not.toHaveBeenCalled();
    await expect(
        workspace.command(
            { operation: "edit-workflow", workflowId: "flow1", expectedVersionId: "old", edits: [] },
            context
        )
    ).rejects.toThrow("changed");
    expect(executeJavaScript.mock.calls.filter(([source]) => source.includes('"method":"PATCH"'))).toHaveLength(0);
});

it("rejects unknown surfaces before startup and prevents worker target changes", async () => {
    const { workspace, runtime } = fixture();
    await expect(workspace.command({ operation: "open", surface: "templates" as any }, context)).rejects.toThrow(
        "Unknown"
    );
    expect(runtime.start).not.toHaveBeenCalled();
    await expect(
        workspace.command({ operation: "get-workflow", workflowId: "other" }, { ...context, n8nWorkflowId: "assigned" })
    ).rejects.toThrow("another workflow");
});

it("creates workflows with the Hermes agent and retains authentication errors", async () => {
    const { workspace } = fixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ data: { id: "created" } }));
    await workspace.command({ operation: "create-workflow", name: "My flow" }, context);
    expect(fetchMock.mock.calls[0][1].body).toContain("CUSTOM.hermesAgent");
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty("browser-id");
    fetchMock
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(workspace.command({ operation: "workflows" }, context)).rejects.toThrow(
        "Reconnect your KronTerm account"
    );
});

it("keeps original editor requests authenticated and renews an expired session", async () => {
    const { workspace } = fixture();
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("expired", { status: 401 }))
        .mockResolvedValueOnce(Response.json({ data: { id: "flow1" } }));
    try {
        const result = await workspace.command(
            { operation: "editor-request", input: { route: "/rest/workflows/flow1" } },
            context
        );
        expect(result).toMatchObject({ status: 200, data: { data: { id: "flow1" } } });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(result)).not.toContain("cookie");
        for (const route of ["https://example.com/rest/login", "/rest/../secret", "/secret"]) {
            await expect(workspace.command({ operation: "editor-request", input: { route } }, context)).rejects.toThrow(
                "Invalid editor API route"
            );
        }
        expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
        fetchMock.mockRestore();
    }
});
it("transports original credential uploads and binary responses through the scoped proxy", async () => {
    const { workspace } = fixture();
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream" } })
        );
    try {
        const result = await workspace.command(
            {
                operation: "editor-request",
                input: {
                    route: "/rest/binary-data",
                    method: "POST",
                    responseType: "arraybuffer",
                    form: [{ name: "file", value: [42], filename: "fixture.txt", type: "text/plain" }],
                },
            },
            context
        );
        expect(result).toMatchObject({ status: 200, bytes: [1, 2, 3] });
        const options = fetchMock.mock.calls[0][1];
        expect(options.body).toBeInstanceOf(FormData);
        expect(options.headers).not.toHaveProperty("content-type");
    } finally {
        fetchMock.mockRestore();
    }
});

it("acknowledges ordered editor state and ignores snapshots from a previous mount", async () => {
    mocks.account = true;
    const { workspace } = fixture();
    await workspace.command({ operation: "open", workflowId: "flow1" }, context);
    const session = await workspace.command({ operation: "editor-session" }, context);
    const newer = await workspace.command(
        { operation: "editor-state", input: { stateId: session.stateId, sequence: 2, dirty: true } },
        context
    );
    expect(newer).toMatchObject({ updated: true, sequence: 2 });
    expect(
        await workspace.command(
            { operation: "editor-state", input: { stateId: session.stateId, sequence: 1, dirty: false } },
            context
        )
    ).toMatchObject({ updated: false });
    const next = await workspace.command({ operation: "editor-session" }, context);
    expect(next.stateId).not.toBe(session.stateId);
    expect(
        await workspace.command(
            { operation: "editor-state", input: { stateId: session.stateId, sequence: 3, dirty: false } },
            context
        )
    ).toMatchObject({ updated: false });
});

it("checks live native editor state before Hermes edits and releases its mutation lease", async () => {
    mocks.account = true;
    const { workspace } = fixture();
    const draft = { id: "flow1", name: "Flow", versionId: "v1", checksum: "c1", nodes: [], connections: {} };
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (_url, options) =>
            Response.json({ data: options?.method === "PATCH" ? { ...draft, versionId: "v2" } : draft })
        );
    let dirty = true;
    const executeJavaScript = vi.fn(async (source: string) =>
        source.includes("getDocumentState")
            ? { workflowId: "flow1", dirty }
            : source.includes("beginDocumentMutation")
              ? { workflowId: "flow1", dirty: false }
              : undefined
    );
    mocks.contents = [{ id: 42, isDestroyed: () => false, getType: () => "window", executeJavaScript, once: vi.fn() }];
    await workspace.command({ operation: "open", workflowId: "flow1" }, context);
    await workspace.command({ operation: "editor-session" }, { ...context, n8nEditorId: 42 });
    await expect(
        workspace.command(
            { operation: "edit-workflow", workflowId: "flow1", expectedVersionId: "v1", edits: [AddedNode] },
            context
        )
    ).rejects.toThrow("Save the current");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(0);
    dirty = false;
    await workspace.command(
        { operation: "edit-workflow", workflowId: "flow1", expectedVersionId: "v1", edits: [AddedNode] },
        context
    );
    expect(executeJavaScript.mock.calls.some(([source]) => source.includes("beginDocumentMutation"))).toBe(true);
    expect(executeJavaScript.mock.calls.some(([source]) => source.includes("endDocumentMutation"))).toBe(true);
    const patch = fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")[1];
    expect(JSON.parse(String(patch.body)).expectedChecksum).toBe("c1");
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
        documentRevision: 1,
        documentWorkflowId: "flow1",
    });
});

it("serializes competing Hermes writes and rejects the second stale version", async () => {
    const { workspace } = fixture();
    let version = "v1";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
        const result = { id: "flow1", name: "Flow", versionId: version, nodes: [], connections: {} };
        if (options?.method === "PATCH") {
            version = "v2";
            return Response.json({ data: { ...result, versionId: version } });
        }
        return Response.json({ data: result });
    });
    const command = {
        operation: "edit-workflow" as const,
        workflowId: "flow1",
        expectedVersionId: "v1",
        edits: [AddedNode],
    };
    const results = await Promise.allSettled([
        workspace.command(command, context),
        workspace.command(command, context),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(1);
});

it("preserves cancellation for a queued document save", async () => {
    const { workspace } = fixture();
    let release: () => void;
    let started: () => void;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        started();
        await new Promise<void>((resolve) => {
            release = resolve;
        });
        return Response.json({ data: { id: "flow1" } });
    });
    const first = workspace.command(
        {
            operation: "editor-request",
            input: { route: "/rest/workflows", method: "POST", requestId: "first", body: {} },
        },
        context
    );
    await ready;
    const second = workspace.command(
        {
            operation: "editor-request",
            input: { route: "/rest/workflows", method: "POST", requestId: "second", body: {} },
        },
        context
    );
    await workspace.command({ operation: "editor-cancel", input: { requestId: "second" } }, context);
    release();
    await first;
    await expect(second).rejects.toThrow("cancelled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects a native save with an outdated checksum before it overwrites the graph", async () => {
    const { workspace } = fixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { checksum: "current" } }));
    const result = await workspace.command(
        {
            operation: "editor-request",
            input: { route: "/rest/workflows/flow1", method: "PATCH", body: { expectedChecksum: "old", nodes: [] } },
        },
        context
    );
    expect(result).toMatchObject({ status: 409 });
    expect(fetchMock.mock.calls.map(([, options]) => options.method)).toEqual(["GET"]);
});

it("restores original editor interaction after a failed Hermes save", async () => {
    mocks.account = true;
    const { workspace } = fixture();
    const draft = { id: "flow1", name: "Flow", versionId: "v1", nodes: [], connections: {} };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) =>
        options.method === "PATCH" ? new Response("failure", { status: 500 }) : Response.json({ data: draft })
    );
    const executeJavaScript = vi.fn(async (source: string) =>
        source.includes("getDocumentState")
            ? { workflowId: "flow1", dirty: false }
            : source.includes("beginDocumentMutation")
              ? { workflowId: "flow1", dirty: false }
              : undefined
    );
    mocks.contents = [{ id: 42, isDestroyed: () => false, getType: () => "window", executeJavaScript, once: vi.fn() }];
    await workspace.command({ operation: "open", workflowId: "flow1" }, context);
    await workspace.command({ operation: "editor-session" }, { ...context, n8nEditorId: 42 });
    await expect(
        workspace.command(
            { operation: "edit-workflow", workflowId: "flow1", expectedVersionId: "v1", edits: [AddedNode] },
            context
        )
    ).rejects.toThrow("500");
    expect(executeJavaScript.mock.calls.some(([source]) => source.includes("endDocumentMutation"))).toBe(true);
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({ documentRevision: 0 });
});

it("starts the scoped runtime before the first workflow is created", async () => {
    const { workspace, runtime } = fixture();
    let running = false;
    runtime.status = () => (running ? { running: true, url: "http://127.0.0.1:5678" } : ({ running: false } as any));
    runtime.assertScope.mockImplementation(() => {
        if (!running) throw new Error("Start the workflow canvas in this workspace first.");
    });
    runtime.start.mockImplementation(async () => {
        running = true;
        return { running: true, url: "http://127.0.0.1:5678" };
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { id: "first-flow" } }));
    const created = await workspace.command({ operation: "create-workflow", name: "First flow" }, context);
    expect(created.id).toBe("first-flow");
    expect(runtime.start).toHaveBeenCalledWith(context, { terminal: { view: "term" } });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
        selectedWorkflowId: "first-flow",
        running: true,
    });
});

it("opens management pages from a stopped runtime without opening a canvas first", async () => {
    for (const surface of ["credentials", "data-tables", "users"] as const) {
        const { workspace, runtime } = fixture();
        let running = false;
        runtime.status = () =>
            running ? { running: true, url: "http://127.0.0.1:5678" } : ({ running: false } as any);
        runtime.assertScope.mockImplementation(() => {
            if (!running) throw new Error("Runtime is stopped.");
        });
        runtime.start.mockImplementation(async () => {
            running = true;
            return { running: true, url: "http://127.0.0.1:5678" };
        });
        await workspace.command({ operation: "open", surface: surface as any }, context);
        expect(runtime.start).toHaveBeenCalledOnce();
        expect(await workspace.command({ operation: "state" }, context)).toMatchObject({ desktop: { surface } });
    }
});

it("does not start a runtime for status polling or an unconfigured shared account", async () => {
    const { workspace, runtime } = fixture();
    runtime.status = () => ({ running: false }) as any;
    await workspace.command({ operation: "state" }, context);
    expect(runtime.start).not.toHaveBeenCalled();
    mocks.account = false;
    await expect(workspace.command({ operation: "create-workflow", name: "First flow" }, context)).rejects.toThrow(
        "Connect your KronTerm account"
    );
    expect(runtime.start).not.toHaveBeenCalled();
});

it("lists only current-tab live widget bindings without starting the workflow runtime", async () => {
    const { workspace, runtime } = fixture();
    mocks.blocks = [
        { blockid: "browser", tabid: "tab", meta: { view: "web", "display:name": "Research" } },
        { oid: "terminal", tabid: "tab", view: "term" },
        { blockid: "other-tab", tabid: "private-tab", meta: { view: "preview" } },
        { tabid: "tab", meta: { view: "web" } },
    ];
    expect(await workspace.command({ operation: "workspace-widgets" }, context)).toEqual([
        { blockId: "browser", label: "Research", view: "web" },
        { blockId: "terminal", label: "term", view: "term" },
    ]);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.assertScope).not.toHaveBeenCalled();
    await expect(workspace.command({ operation: "workspace-widgets" }, { tabId: "tab" })).rejects.toThrow(
        "Open a workspace tab"
    );
});

it("keeps native document selection authoritative over stale legacy canvas URLs", async () => {
    const { workspace } = fixture();
    await workspace.command({ operation: "open", surface: "canvas", workflowId: "native-flow" }, context);
    await workspace.command({ operation: "select-workflow", workflowId: "native-flow" }, context);
    mocks.blocks = [
        {
            blockid: "legacy-canvas",
            tabid: "tab",
            meta: { "n8n:surface": "canvas", url: "http://127.0.0.1:5678/workflow/deleted-old-flow" },
        },
        { blockid: "legacy-execution", tabid: "tab", meta: { "n8n:surface": "executions" } },
    ];
    expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
        selectedWorkflowId: "native-flow",
        documentWorkflowId: "native-flow",
        documentRevision: 1,
        desktop: { surface: "canvas", url: "http://127.0.0.1:5678/workflow/native-flow" },
    });
    expect(mocks.set).not.toHaveBeenCalled();
});

it("reports the failed request method and pathname without query values", async () => {
    const { workspace } = fixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ message: "missing" }, { status: 404 }));
    await expect(workspace.command({ operation: "workflows" }, context)).rejects.toThrow(
        "Workflow service returned 404 (GET /rest/workflows)"
    );
});

it("selects the opened saved workflow before any native editor route acknowledgement", async () => {
    for (const surface of ["canvas", "executions", "evaluations"] as const) {
        const { workspace, store } = fixture();
        store.command(context, { action: "select-workflow", workflowId: "flow1" });
        await workspace.command({ operation: "open", surface, workflowId: "flow2" }, context);
        expect(await workspace.command({ operation: "state" }, context)).toMatchObject({
            selectedWorkflowId: "flow2",
            documentWorkflowId: "flow2",
            desktop: { surface, documentWorkflowId: "flow2" },
        });
        await workspace.command({ operation: "open", surface }, context);
        expect(store.read(context).selectedWorkflowId).toBe("flow2");
    }
});

it("keeps management and new-draft opens from replacing the selected saved workflow", async () => {
    const { workspace, store } = fixture();
    store.command(context, { action: "select-workflow", workflowId: "flow1" });
    await workspace.command({ operation: "open", surface: "credentials", workflowId: "flow2" }, context);
    expect(store.read(context).selectedWorkflowId).toBe("flow1");
    await workspace.command({ operation: "open", surface: "canvas", workflowId: "new" }, context);
    expect(store.read(context).selectedWorkflowId).toBe("flow1");
});
