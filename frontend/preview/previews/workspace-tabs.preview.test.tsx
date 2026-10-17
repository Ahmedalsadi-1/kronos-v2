// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    env: { callBackendService: vi.fn() },
    block: { waveEnv: null as unknown },
    object: { waveEnv: null as unknown },
    seed: vi.fn(),
    update: vi.fn(),
    mountedEnvs: [] as unknown[],
}));

vi.mock("@/app/store/services", () => ({ BlockService: mocks.block, ObjectService: mocks.object }));
vi.mock("@/app/store/wos", () => ({
    mockObjectForPreview: mocks.seed,
    updateWaveObject: mocks.update,
    makeORef: (type: string, id: string) => `${type}:${id}`,
    getWaveObjectAtom: () => ({}),
}));
vi.mock("@/preview/mock/mockwaveenv", () => ({ makeMockWaveEnv: () => mocks.env }));
vi.mock("@/app/waveenv/waveenv", async () => {
    const { createContext } = await import("react");
    return { WaveEnvContext: createContext(null) };
});
vi.mock("@/app/tab/widget-tabs-layout", () => ({
    WidgetTabsLayout: () => {
        mocks.mountedEnvs.push([mocks.block.waveEnv, mocks.object.waveEnv]);
        return <div className="widget-tabs-layout" />;
    },
}));

import { WorkspaceTabsPreview } from "./workspace-tabs.preview";

afterEach(() => vi.unstubAllGlobals());

it("seeds mock fetches and binds services before the actual layout mounts, then restores them", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const previousBlockEnv = { previous: "block" };
    const previousObjectEnv = { previous: "object" };
    mocks.block.waveEnv = previousBlockEnv;
    mocks.object.waveEnv = previousObjectEnv;
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<WorkspaceTabsPreview />));
    expect(mocks.seed).toHaveBeenCalledTimes(4);
    expect(mocks.update).toHaveBeenCalledTimes(4);
    expect(mocks.seed.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.mountedEnvs).toEqual([[mocks.env, mocks.env]]);
    expect(host.querySelector(".widget-tabs-layout")).not.toBeNull();
    await act(async () => root.unmount());
    expect(mocks.block.waveEnv).toBe(previousBlockEnv);
    expect(mocks.object.waveEnv).toBe(previousObjectEnv);
});
