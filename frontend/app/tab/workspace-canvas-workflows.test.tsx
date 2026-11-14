// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SavedWorkflow, WorkflowCommand, WorkflowSnapshot } from "@/types/workflow";
import { atom } from "jotai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowStore } from "../../../emain/workflow-store";

const mocks = vi.hoisted(() => ({
    command: vi.fn(),
    persist: vi.fn(async (_client: unknown, _data: unknown) => {}),
    changed: undefined as (value: unknown) => void,
}));
vi.mock("@/app/store/global", () => {
    const api = {
        workflowCommand: mocks.command,
        onWorkflowChanged: (callback) => {
            mocks.changed = callback;
            return () => {};
        },
        workflowOpen: vi.fn(async () => true),
    };
    return {
        atoms: { workspace: atom({ oid: "workspace" }), fullConfigAtom: atom({ connections: {} }) },
        getApi: () => api,
    };
});
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { SetMetaCommand: mocks.persist } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/app/store/wos", () => ({ makeORef: (kind, id) => `${kind}:${id}` }));
vi.mock("@/app/view/hermes/hermes-quick-submit", () => ({ submitToHermes: vi.fn() }));
vi.mock("@/app/view/hermes/hermes-surface-controller", () => ({
    hermesSurfaceController: { requestOpenChat: vi.fn() },
}));

import { CanvasWorkflows } from "./workspace-canvas-workflows";

afterEach(() => vi.unstubAllGlobals());

it("flushes pending edits on mode change and cannot schedule a stale save", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.persist.mockClear();
    let finishSave: (value: unknown) => void;
    mocks.command.mockImplementation(async (command: WorkflowCommand) => {
        if (command.action === "save-definition")
            return new Promise((resolve) => {
                finishSave = resolve;
            });
        return { runs: [], workflows: [] };
    });
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const tabData = {
        blockids: [],
        meta: {
            "layout:workflow": {
                title: "Save race",
                graph: {
                    version: 1,
                    nodes: [{ id: "a", kind: "agent", title: "Inspect", instruction: "Inspect inputs" }],
                    edges: [],
                },
            },
        },
    } as unknown as Tab;
    const button = (text: string) =>
        [...element.querySelectorAll("button")].find((value) => value.textContent.trim().startsWith(text));
    try {
        await act(async () =>
            root.render(
                <CanvasWorkflows
                    tabId="save-race"
                    tabData={tabData}
                    camera={{ x: 0, y: 0, zoom: 1 }}
                    rects={{}}
                    selectedBlockId={undefined}
                    onFocusBlock={() => {}}
                />
            )
        );
        await act(async () => button("Workflows").click());
        await act(async () => button("Save workflow").click());
        await act(async () => button("Agent task").click());
        await act(async () => finishSave({ id: "old-definition" }));
        expect(button("Add schedule")).toBeUndefined();
        await act(async () => root.unmount());
        expect(mocks.persist.mock.calls.at(-1)[1]).toMatchObject({
            oref: "tab:save-race",
            meta: { "layout:workflow": { graph: { nodes: [expect.anything(), expect.anything()] } } },
        });
    } finally {
        element.remove();
    }
});

it("submits a bound graph and schedules only a saved definition", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const commands: WorkflowCommand[] = [];
    const snapshot: WorkflowSnapshot = { runs: [], workflows: [], schedules: [] };
    mocks.command.mockImplementation(async (command: WorkflowCommand) => {
        commands.push(command);
        if (command.action === "save-definition") {
            const saved = { ...command.definition, id: "saved" };
            snapshot.workflows.push(saved);
            return saved;
        }
        if (command.action === "create") return { ...command, id: "run" };
        return snapshot;
    });
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const tabData = {
        blockids: ["browser"],
        meta: {
            "layout:workflow": {
                title: "Check browser",
                graph: {
                    version: 1,
                    nodes: [
                        {
                            id: "inspect",
                            kind: "browser",
                            blockId: "browser",
                            title: "Inspect page",
                            instruction: "Verify heading",
                        },
                    ],
                    edges: [],
                },
            },
        },
    } as unknown as Tab;
    const button = (text: string) =>
        [...element.querySelectorAll("button")].find((value) => value.textContent.trim().startsWith(text));
    try {
        await act(async () =>
            root.render(
                <CanvasWorkflows
                    tabId="tab"
                    tabData={tabData}
                    camera={{ x: 0, y: 0, zoom: 1 }}
                    rects={{ browser: { x: 10, y: 20, width: 500, height: 300 } }}
                    selectedBlockId="browser"
                    onFocusBlock={() => {}}
                />
            )
        );
        await act(async () => button("Workflows").click());
        expect(button("Add schedule")).toBeUndefined();
        await act(async () => button("Run workflow").click());
        expect(commands.find((value) => value.action === "create")).toMatchObject({
            target: { workspaceId: "workspace", tabId: "tab", blockIds: ["browser"] },
            graph: { version: 1 },
            steps: [{ id: "inspect", blockId: "browser" }],
        });
        await act(async () => button("Save workflow").click());
        await act(async () => button("Add schedule").click());
        expect(commands.find((value) => value.action === "upsert-schedule")).toMatchObject({
            schedule: { workflowId: "saved", intervalMinutes: 60, enabled: true, missedRunPolicy: "skip" },
        });
    } finally {
        await act(async () => root.unmount());
        element.remove();
    }
});

it("updates the same saved workflow and keeps its active schedule after reopening Canvas", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.persist.mockClear();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-canvas-workflow-"));
    const store = new WorkflowStore(path.join(directory, "journal.json"));
    mocks.command.mockImplementation(async (command: WorkflowCommand) => store.command(command));
    const saved = store.command({
        action: "save-definition",
        definition: {
            id: "initial",
            title: "Review workflow",
            kind: "automation",
            target: { workspaceId: "workspace", tabId: "tab", blockIds: [], environment: "workspace" },
            parameters: { task: "Review local inputs" },
            graph: {
                version: 1,
                nodes: [{ id: "review", kind: "review", title: "Review", instruction: "Review the original inputs." }],
                edges: [],
            },
            steps: [],
        },
    }) as SavedWorkflow;
    store.command({
        action: "upsert-schedule",
        schedule: {
            workflowId: saved.id,
            conversationId: "test",
            timezone: "UTC",
            intervalMinutes: 60,
            startAt: Date.now() + 3600000,
            enabled: true,
            missedRunPolicy: "skip",
        },
    });
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const renderWorkflows = (key: string, meta: Record<string, unknown> = {}) => (
        <CanvasWorkflows
            key={key}
            tabId="tab"
            tabData={{ blockids: [], meta } as unknown as Tab}
            camera={{ x: 0, y: 0, zoom: 1 }}
            rects={{}}
            selectedBlockId={undefined}
            onFocusBlock={() => {}}
        />
    );
    const button = (name: string) =>
        [...element.querySelectorAll("button")].find((item) => item.textContent.trim() === name);
    try {
        await act(async () => root.render(renderWorkflows("original")));
        await act(async () => button("Workflows 0").click());
        const select = element.querySelector("select");
        await act(async () => {
            select.value = saved.id;
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => button("Review").click());
        expect(button("Add schedule")).toBeUndefined();
        expect(button("Pause schedule")).toBeDefined();
        await act(async () => button("Save workflow").click());
        const updated = store.snapshot();
        expect(updated.workflows).toHaveLength(1);
        expect(updated.workflows[0]).toMatchObject({
            id: saved.id,
            version: 2,
            graph: { nodes: [expect.anything(), expect.anything()] },
        });
        expect(updated.schedules[0]).toMatchObject({ workflowId: saved.id, enabled: true });
        await act(async () => root.render(null));
        const { meta } = mocks.persist.mock.calls.at(-1)[1] as { meta: Record<string, unknown> };
        expect(meta["layout:workflow"]).toMatchObject({ savedWorkflow: { id: saved.id, version: 2, dirty: false } });
        await act(async () => root.render(renderWorkflows("reopened", meta)));
        await act(async () => button("Workflows 2").click());
        expect(element.querySelector("select").value).toBe(saved.id);
        expect(button("Pause schedule")).toBeDefined();
        expect(button("Add schedule")).toBeDefined();
    } finally {
        await act(async () => root.unmount());
        element.remove();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

it("prevents a draft from running against a closed widget", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.command.mockReset();
    mocks.command.mockResolvedValue({ runs: [], workflows: [] });
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    const tabData = {
        blockids: [],
        meta: {
            "layout:workflow": {
                title: "Closed target",
                graph: {
                    version: 1,
                    nodes: [{ id: "task", kind: "widget", blockId: "closed", title: "Check", instruction: "Inspect" }],
                    edges: [],
                },
            },
        },
    } as unknown as Tab;
    try {
        await act(async () =>
            root.render(
                <CanvasWorkflows
                    tabId="tab"
                    tabData={tabData}
                    camera={{ x: 0, y: 0, zoom: 1 }}
                    rects={{}}
                    selectedBlockId={undefined}
                    onFocusBlock={() => {}}
                />
            )
        );
        await act(async () => element.querySelector<HTMLButtonElement>(".canvas-workflow-toggle").click());
        await act(async () =>
            [...element.querySelectorAll("button")].find((value) => value.textContent === "Run workflow").click()
        );
        expect(element.querySelector('[role="alert"]').textContent).toContain("closed");
        expect(mocks.command.mock.calls.some(([command]) => command.action === "create")).toBe(false);
    } finally {
        await act(async () => root.unmount());
        element.remove();
    }
});
