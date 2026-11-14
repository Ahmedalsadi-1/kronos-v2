// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { $comfyControlsOpen } from "@hermes/lib/kronterm-sidebar";
import { $workflowPickerComfyTarget, $workflowPickerSource } from "@hermes/store/command-palette";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OSComfyWorkflow } from "./os-comfy-workflow";
import { OSOriginalWorkflow } from "./os-original-workflow";

const mocks = vi.hoisted(() => ({
    loadEditor: vi.fn(),
    comfyRequest: vi.fn(),
    hermesRequest: vi.fn(),
}));
vi.mock("./os-workflow-host", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./os-workflow-host")>()),
    loadWorkflowEditor: mocks.loadEditor,
}));
vi.mock("@/store/global", () => ({
    getApi: () => ({ comfyUiRequest: mocks.comfyRequest, hermesApi: mocks.hermesRequest }),
}));
vi.mock("@/app/components/system-ui", () => ({
    useSystemAppearance: () => ({ colorScheme: "dark" }),
    SystemButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));
vi.mock("@hermes/app/workflows/original-node-picker", () => ({
    OriginalExecutionsPanel: () => null,
    OriginalNodePicker: () => null,
}));
vi.mock("@hermes/app/workflows/widget-connection-dialog", () => ({ WidgetConnectionDialog: () => null }));

const camera = { x: 0, y: 0, zoom: 1 };
const changedCamera = { x: 100, y: -40, zoom: 1.5 };
const world = () => document.createElement("div");
let element: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
        }
    );
    element = world();
    document.body.append(element);
    root = createRoot(element);
});

afterEach(async () => {
    await act(async () => root.unmount());
    $comfyControlsOpen.set(false);
    $workflowPickerComfyTarget.set(null);
    $workflowPickerSource.set(null);
    element.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function comfyProps() {
    return {
        tabId: "tab",
        active: true,
        visible: true,
        camera,
        order: {},
        world: world(),
        libraryTarget: null,
        propertiesTarget: null,
        logsTarget: null,
        panels: { library: null, properties: false, logs: false },
        allowCanvasPicker: true,
        onActivate: vi.fn(),
        onReady: vi.fn(),
        onTogglePanel: vi.fn(),
        onClosePanel: vi.fn(),
        onNodes: vi.fn(),
        onSelect: vi.fn(),
        onFit: vi.fn(),
        onClose: vi.fn(),
    };
}

const connect = () =>
    document.querySelector<HTMLFormElement>('[aria-label="KronRender workflow controls"] form').requestSubmit();

it("connects KronRender before optional panels exist and applies changes made during startup", async () => {
    const props = comfyProps();
    const editor = {
        setCamera: vi.fn(),
        setOrder: vi.fn(),
        setPanelTargets: vi.fn(),
        setPanels: vi.fn(),
        closePicker: vi.fn(),
        dispose: vi.fn(),
    };
    let finishMount: () => void;
    const mountComfyEditor = vi.fn(({ onReady }) => {
        onReady();
        return new Promise((resolve) => {
            finishMount = () => resolve(editor);
        });
    });
    let finishConnection: () => void;
    mocks.comfyRequest.mockImplementation(
        () => new Promise((resolve) => {
            finishConnection = () => resolve({ editorUrl: "http://127.0.0.1:18188/editor" });
        })
    );
    mocks.loadEditor.mockResolvedValue({ mountComfyEditor });
    $comfyControlsOpen.set(true);
    await act(async () => root.render(<OSComfyWorkflow {...props} />));
    expect(mocks.comfyRequest).toHaveBeenCalledOnce();
    expect(mocks.loadEditor).toHaveBeenCalledWith("comfy-native");
    expect(mountComfyEditor).not.toHaveBeenCalled();
    await act(async () => finishConnection());
    expect(mountComfyEditor).toHaveBeenCalledWith(expect.objectContaining({ libraryTarget: null }));
    expect(props.onReady).not.toHaveBeenCalledWith(true);

    const library = world();
    await act(async () => root.render(<OSComfyWorkflow {...props} camera={changedCamera} libraryTarget={library} />));
    await act(async () => finishMount());
    expect(editor.setCamera).toHaveBeenLastCalledWith(changedCamera);
    expect(editor.setPanelTargets).toHaveBeenLastCalledWith(
        expect.objectContaining({ libraryTarget: library.shadowRoot.querySelector("[data-comfy-mount]") })
    );
    expect(props.onReady).toHaveBeenLastCalledWith(true);

    await act(async () => root.render(<OSComfyWorkflow {...props} />));
    expect(editor.setPanelTargets).toHaveBeenLastCalledWith(expect.objectContaining({ libraryTarget: null }));
    expect(mountComfyEditor).toHaveBeenCalledTimes(1);
    expect(editor.dispose).not.toHaveBeenCalled();
});

it("lets KronRender reconnect after its frontend fails to become ready", async () => {
    vi.useFakeTimers();
    const props = comfyProps();
    const editor = {
        setCamera: vi.fn(),
        setOrder: vi.fn(),
        setPanels: vi.fn(),
        setPanelTargets: vi.fn(),
        dispose: vi.fn(),
    };
    const mountComfyEditor = vi.fn().mockResolvedValue(editor);
    mocks.comfyRequest.mockResolvedValue({ editorUrl: "http://127.0.0.1:18188/editor" });
    mocks.loadEditor.mockResolvedValue({ mountComfyEditor });
    $comfyControlsOpen.set(true);
    await act(async () => root.render(<OSComfyWorkflow {...props} />));
    await act(async () => vi.advanceTimersByTimeAsync(45000));
    expect(document.querySelector('[aria-label="KronRender workflow controls"] [role="alert"]').textContent).toContain(
        "did not finish loading"
    );
    expect(editor.dispose).toHaveBeenCalledOnce();
    await act(async () => connect());
    expect(mountComfyEditor).toHaveBeenCalledTimes(2);
});

it("limits KronRender results and placement to the selected catalog and workspace tab", async () => {
    const props = comfyProps();
    const catalog = world();
    const overflow = world();
    document.body.append(catalog, overflow);
    const editor = {
        setCamera: vi.fn(),
        setOrder: vi.fn(),
        setPanels: vi.fn(),
        setPanelTargets: vi.fn(),
        closePicker: vi.fn(),
        dispose: vi.fn(),
        listNodes: vi.fn((query: string) => (query ? [] : [{ id: "save", label: "Save Image", detail: "image" }])),
        listModels: vi.fn().mockResolvedValue([{ id: "model", label: "Pixel XL", detail: "checkpoints" }]),
        insertNode: vi.fn().mockReturnValue(true),
        placeModel: vi.fn().mockReturnValue(true),
    };
    mocks.comfyRequest.mockResolvedValue({ editorUrl: "http://127.0.0.1:18188/editor" });
    mocks.loadEditor.mockResolvedValue({
        mountComfyEditor: async ({ onReady }) => {
            onReady();
            return editor;
        },
    });
    $comfyControlsOpen.set(true);
    try {
        await act(async () => root.render(<OSComfyWorkflow {...props} />));
        await act(async () => {
            $workflowPickerSource.set("comfy-nodes");
            $workflowPickerComfyTarget.set({ element: catalog, overflow, query: "", tabId: "other-tab" });
        });
        expect(catalog.childElementCount).toBe(0);
        expect(editor.listNodes).not.toHaveBeenCalled();

        const target = { element: catalog, overflow, query: "", tabId: props.tabId };
        await act(async () => $workflowPickerComfyTarget.set(target));
        expect(catalog.textContent).toContain("Save Image");
        expect(editor.listModels).not.toHaveBeenCalled();
        await act(async () => $workflowPickerComfyTarget.set({ ...target, query: "missing" }));
        expect(catalog.querySelector('[role="status"]').textContent).toBe("No nodes match this search.");

        await act(async () => {
            $workflowPickerSource.set("comfy-models");
            $workflowPickerComfyTarget.set(target);
        });
        expect(catalog.textContent).not.toContain("Save Image");
        expect(catalog.textContent).toContain("Pixel XL");
        await act(async () => catalog.querySelector("button").click());
        expect(editor.placeModel).toHaveBeenCalledExactlyOnceWith("model");
        expect(editor.insertNode).not.toHaveBeenCalled();
        expect($workflowPickerSource.get()).toBeNull();
    } finally {
        catalog.remove();
        overflow.remove();
    }
});

it("retargets the n8n panels without remounting the current workflow", async () => {
    const props = {
        tabId: "tab",
        camera,
        visible: true,
        worldTarget: world(),
        viewportTarget: world(),
        objectOrder: {},
        onCameraIntent: vi.fn(),
        onObjects: vi.fn(),
        onActivate: vi.fn(),
        onChat: vi.fn(),
    };
    const setPanelTargets = vi.fn();
    const dispose = vi.fn();
    const mountKronTermWorkflow = vi.fn(async (_root, host) => {
        host.setPanelTargets = setPanelTargets;
        host.onReady();
        return dispose;
    });
    mocks.loadEditor.mockResolvedValue({ mountKronTermWorkflow });
    mocks.hermesRequest.mockImplementation(async ({ body }) =>
        body.operation === "state"
            ? { desktop: { url: "http://localhost:5678/workflow/flow", surface: "canvas" }, selectedWorkflowId: "flow" }
            : { workflowId: "flow" }
    );
    const first = world();
    const second = world();
    await act(async () => root.render(<OSOriginalWorkflow {...props} toolsTarget={first} />));
    await act(async () => root.render(<OSOriginalWorkflow {...props} toolsTarget={second} />));
    expect(setPanelTargets).toHaveBeenLastCalledWith({
        tools: second.shadowRoot.querySelector("[data-workflow-slot-root]"),
        focus: null,
    });
    expect(mountKronTermWorkflow).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
});

it("mounts a newly opened n8n editor immediately after an in-flight state request", async () => {
    let resolveState: (value: unknown) => void;
    let resolveSession: (value: unknown) => void;
    const activeState = { desktop: { url: "http://127.0.0.1:5678/workflow/new", surface: "canvas" } };
    const mountKronTermWorkflow = vi.fn(async (_root, host) => {
        host.onReady();
        return vi.fn();
    });
    mocks.hermesRequest.mockImplementation(({ body }) =>
        body.operation === "editor-session"
            ? new Promise((resolve) => {
                  resolveSession = resolve;
              })
            : Promise.resolve(activeState)
    );
    mocks.hermesRequest.mockImplementationOnce(
        () => new Promise((resolve) => {
            resolveState = resolve;
        })
    );
    mocks.loadEditor.mockResolvedValue({ mountKronTermWorkflow });
    await act(async () =>
        root.render(
            <OSOriginalWorkflow
                tabId="tab"
                camera={camera}
                visible
                worldTarget={world()}
                viewportTarget={world()}
                objectOrder={{}}
                onCameraIntent={vi.fn()}
                onObjects={vi.fn()}
                onActivate={vi.fn()}
                onChat={vi.fn()}
            />
        )
    );
    await act(async () => {
        window.dispatchEvent(new CustomEvent("kronterm:workflow-open", { detail: { tabId: "tab" } }));
        resolveState({});
    });
    expect(mocks.loadEditor).toHaveBeenCalledWith("workflow-native");
    expect(mountKronTermWorkflow).not.toHaveBeenCalled();
    await act(async () => resolveSession({ path: "/workflow/new" }));
    expect(mountKronTermWorkflow).toHaveBeenCalledOnce();
});

it("leaves the n8n runtime stopped when opening the KronRender picker", async () => {
    mocks.hermesRequest.mockResolvedValue({ running: false });
    $workflowPickerSource.set("comfy-nodes");
    await act(async () =>
        root.render(
            <OSOriginalWorkflow
                tabId="tab"
                camera={camera}
                visible
                worldTarget={world()}
                viewportTarget={world()}
                objectOrder={{}}
                onCameraIntent={vi.fn()}
                onObjects={vi.fn()}
                onActivate={vi.fn()}
                onChat={vi.fn()}
            />
        )
    );
    await act(async () =>
        window.dispatchEvent(
            new CustomEvent("kronterm:original-node-picker", { detail: { target: world(), tabId: "tab" } })
        )
    );
    expect(mocks.hermesRequest.mock.calls.map(([request]) => request.body.operation)).toEqual(["state"]);
});
