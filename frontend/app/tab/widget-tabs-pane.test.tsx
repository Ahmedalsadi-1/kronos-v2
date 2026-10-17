// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/layout/lib/layoutModelHooks", () => ({ useNodeModel: () => ({}) }));
vi.mock("@/app/store/wos", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/store/wos")>()),
    getWaveObjectAtom: () => NullBlockAtom,
}));
vi.mock("@/app/block/persistent-block", () => ({
    PersistentBlock: () => {
        const mode = useBlockChrome();
        const host = useBlockToolbarHost();
        return (
            <div data-block-chrome={mode}>
                {host &&
                    createPortal(
                        <button type="button" onClick={Action}>
                            Context action
                        </button>,
                        host
                    )}
            </div>
        );
    },
}));

import { useBlockChrome, useBlockToolbarHost } from "@/app/block/block-chrome-context";
import { FlexDirection } from "@/layout/lib/types";
import { atom } from "jotai";
import { WidgetTabPane } from "./widget-tabs-layout";

const NullBlockAtom = atom(null);
const Action = vi.fn();
afterEach(() => vi.unstubAllGlobals());

it("integrates canonical block chrome while retaining contextual actions through the pane toolbar portal", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () =>
        root.render(
            <WidgetTabPane
                node={{ id: "node", size: 100, flexDirection: FlexDirection.Row, data: { blockId: "block" } }}
                active
                layoutModel={null}
                onClose={() => {}}
                onExpandCompanion={() => {}}
                onReturnToAgent={() => {}}
                recentActivity={[]}
                workbenchRole={undefined}
            />
        )
    );
    expect(host.querySelector('[data-block-chrome="integrated"]')).not.toBeNull();
    const button = host.querySelector<HTMLButtonElement>(".widget-pane-toolbar button");
    expect(button?.textContent).toBe("Context action");
    await act(async () => button.click());
    expect(Action).toHaveBeenCalledOnce();
    expect(host.querySelector(".block-frame-default-header")).toBeNull();
    await act(async () => root.unmount());
});
