// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkspaceWidgetPicker } from "./workspace-widget-picker";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@hermes/components/ui/codicon", () => ({ Codicon: () => null }));

it("lists live scoped widgets and requests original node insertion bound to the exact block", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    const api = vi.fn(async () => [{ blockId: "block-terminal", label: "Build terminal", view: "term" }]);
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    const insert = vi.fn();
    window.addEventListener("kronterm:workflow-insert-widget", insert);
    try {
        await act(async () => root.render(<WorkspaceWidgetPicker active={false} tabId="tab-a" workflowId="flow-a" />));
        expect(api).not.toHaveBeenCalled();
        await act(async () => root.render(<WorkspaceWidgetPicker active tabId="tab-a" workflowId="flow-a" />));
        expect(api).toHaveBeenCalledWith(expect.objectContaining({ body: { operation: "workspace-widgets" } }));
        const button = host.querySelector<HTMLButtonElement>('[aria-label="Add Build terminal as workflow node"]');
        expect(button).not.toBeNull();
        await act(async () => button.click());
        const detail = insert.mock.calls[0][0].detail;
        expect(detail).toMatchObject({
            tabId: "tab-a",
            workflowId: "flow-a",
            blockId: "block-terminal",
            label: "Build terminal",
            view: "term",
        });
        expect(button.disabled).toBe(true);
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-widget-inserted", { detail: { ...detail, tabId: "other" } })
            )
        );
        expect(button.disabled).toBe(true);
        await act(async () => window.dispatchEvent(new CustomEvent("kronterm:workflow-widget-inserted", { detail })));
        expect(button.disabled).toBe(false);
        expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
        window.removeEventListener("kronterm:workflow-insert-widget", insert);
    }
});

it("shows original editor insertion failures and permits retry without creating another widget", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    const api = vi.fn(async () => [{ blockId: "block-web", label: "Browser", view: "web" }]);
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    const insert = vi.fn();
    window.addEventListener("kronterm:workflow-insert-widget", insert);
    try {
        await act(async () => root.render(<WorkspaceWidgetPicker active tabId="tab-a" workflowId="flow-a" />));
        const button = host.querySelector<HTMLButtonElement>('[aria-label="Add Browser as workflow node"]');
        await act(async () => button.click());
        await act(async () =>
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-widget-inserted", {
                    detail: { ...insert.mock.calls[0][0].detail, error: "Save local edits first." },
                })
            )
        );
        expect(host.querySelector('[role="alert"]').textContent).toBe("Save local edits first.");
        expect(button.disabled).toBe(false);
        expect(api).toHaveBeenCalledTimes(1);
        await act(async () => button.click());
        expect(insert).toHaveBeenCalledTimes(2);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        window.hermesDesktop = previous;
        window.removeEventListener("kronterm:workflow-insert-widget", insert);
    }
});

it("filters embedded widget entries with the original search without creating a second scrolling panel", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const previous = window.hermesDesktop;
    const api = vi.fn(async () => [
        { blockId: "web", label: "Research browser", view: "web" },
        { blockId: "term", label: "Build terminal", view: "term" },
    ]);
    window.hermesDesktop = { ...previous, api: api as unknown as Window["hermesDesktop"]["api"] };
    try {
        await act(async () =>
            root.render(<WorkspaceWidgetPicker active embedded tabId="tab-a" workflowId="flow-a" query="terminal" />)
        );
        expect(host.querySelector('[aria-label="Add Build terminal as workflow node"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="Add Research browser as workflow node"]')).toBeNull();
        expect(host.textContent).not.toContain("Add a node bound to a live widget.");
        expect(host.querySelector("ul").className).not.toContain("overflow-y-auto");
        await act(async () =>
            root.render(<WorkspaceWidgetPicker active embedded tabId="tab-a" workflowId="flow-a" query="unmatched" />)
        );
        expect(host.childElementCount).toBe(0);
        expect(api).toHaveBeenCalledTimes(1);
    } finally {
        await act(async () => root.unmount());
        window.hermesDesktop = previous;
    }
});
