// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StreamingImagePreview } from "./preview-streaming";

vi.mock("@/app/aipanel/ai-utils", () => ({ createDataUrl: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: vi.fn() }));
vi.mock("@/app/element/button", () => ({
    Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}));
vi.mock("@/app/element/quickelems", () => ({ CenteredDiv: () => null }));
vi.mock("@/app/store/jotaiStore", () => ({ globalStore: { get: () => "" } }));
vi.mock("@/util/endpoints", () => ({ getWebServerEndpoint: vi.fn() }));
vi.mock("react-zoom-pan-pinch", () => ({
    TransformComponent: ({ children }: { children: ReactNode }) => <>{children}</>,
    TransformWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    useControls: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() }),
}));

it("places, edits, and deletes a numbered image comment at an image-relative position", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<StreamingImagePreview filename="sample.png" url="/sample.png" />));
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed="false"]').click());
        const surface = host.querySelector<HTMLButtonElement>('[aria-label="Place an image comment"]');
        vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
            left: 20,
            top: 10,
            width: 200,
            height: 100,
        } as DOMRect);
        await act(async () =>
            surface.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    detail: 1,
                    clientX: 70,
                    clientY: 85,
                })
            )
        );
        const pin = () => host.querySelector<HTMLButtonElement>('[aria-label="Comment 1"]');
        expect(pin().style.left).toBe("25%");
        expect(pin().style.top).toBe("75%");
        const enter = async (value: string) => {
            const field = host.querySelector("textarea");
            await act(async () => {
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, value);
                field.dispatchEvent(new Event("input", { bubbles: true }));
            });
            await act(async () => field.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        };
        await enter("First note");
        await act(async () => pin().click());
        expect(host.querySelector("textarea").value).toBe("First note");
        await enter("Updated note");
        await act(async () => pin().click());
        expect(host.querySelector("textarea").value).toBe("Updated note");
        const remove = [...host.querySelectorAll("button")].find((button) => button.textContent === "Delete");
        await act(async () => remove.click());
        expect(pin()).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

it("opens the image in the full viewer and returns to the existing panel", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<StreamingImagePreview filename="sample.png" url="/sample.png" />));
        const dialog = host.querySelector("dialog");
        const showModal = vi.fn(() => {
            dialog.open = true;
        });
        const close = vi.fn(() => {
            dialog.open = false;
        });
        Object.assign(dialog, { showModal, close });
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open image viewer"]').click());
        expect(showModal).toHaveBeenCalledOnce();
        const dock = [...host.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Move to side panel"
        );
        await act(async () => dock.click());
        expect(close).toHaveBeenCalledOnce();
        expect(host.querySelector('[aria-label="Open image viewer"]')).not.toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});
