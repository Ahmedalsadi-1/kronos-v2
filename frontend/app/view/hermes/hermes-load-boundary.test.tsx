// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { act, lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HermesLoadBoundary } from "./hermes-load-boundary";

it("contains rejected chat imports while an unrelated live widget keeps its DOM and draft", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispose = vi.fn();
    let rejectImport: (error: Error) => void;
    const Chat = lazy(
        () =>
            new Promise<{ default: () => React.ReactNode }>((_resolve, reject) => {
                rejectImport = reject;
            })
    );
    function LiveWidget() {
        useEffect(() => dispose, []);
        return <input aria-label="Live widget draft" defaultValue="draft" />;
    }
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    try {
        await act(async () =>
            root.render(
                <>
                    <LiveWidget />
                    <HermesLoadBoundary>
                        <Suspense fallback={<p>Loading chat</p>}>
                            <Chat />
                        </Suspense>
                    </HermesLoadBoundary>
                </>
            )
        );
        const draft = element.querySelector("input");
        draft.value = "unsaved widget work";
        await act(async () => rejectImport(new Error("504 Outdated Optimize Dep")));
        expect(element.querySelector('[role="alert"]')?.textContent).toContain("KronTerm Agent could not load");
        expect(element.querySelector("button")?.textContent).toBe("Reload workspace");
        expect(element.querySelector("input")).toBe(draft);
        expect(draft.value).toBe("unsaved widget work");
        expect(dispose).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        element.remove();
        errorLog.mockRestore();
        vi.unstubAllGlobals();
    }
});

it("preserves the healthy chat instance and its unsaved input across parent renders", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const dispose = vi.fn();
    function Chat() {
        useEffect(() => dispose, []);
        return <textarea defaultValue="" />;
    }
    const element = document.createElement("div");
    const root = createRoot(element);
    try {
        const render = () =>
            act(async () =>
                root.render(
                    <HermesLoadBoundary>
                        <Chat />
                    </HermesLoadBoundary>
                )
            );
        await render();
        const input = element.querySelector("textarea");
        input.value = "unsent Hermes message";
        await render();
        expect(element.querySelector("textarea")).toBe(input);
        expect(input.value).toBe("unsent Hermes message");
        expect(dispose).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});
