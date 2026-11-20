// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { usePenChatPresentation } from "./os-pen-chat-presentation";

it("hides restored canvas widgets until chat closes, including after an editor reconnect", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let presentation: ReturnType<typeof usePenChatPresentation>;
    function Workspace() {
        presentation = usePenChatPresentation();
        return <div data-canvas-widgets hidden={!presentation.widgetsReady || presentation.fullChat} />;
    }
    try {
        await act(async () => root.render(<Workspace />));
        expect(presentation.fullChat).toBe(true);
        // Widget restoration can finish before the lazy chat observer mounts.
        await act(async () => presentation.updateWidgetsReady(true));
        const widgets = host.querySelector<HTMLElement>("[data-canvas-widgets]");
        expect(widgets.hidden).toBe(true);
        await act(async () => presentation.setFullChat(true));
        expect(widgets.hidden).toBe(true);
        await act(async () => presentation.setFullChat(false));
        expect(widgets.hidden).toBe(false);
        await act(async () => presentation.updateWidgetsReady(false));
        await act(async () => presentation.updateWidgetsReady(true));
        expect(widgets.hidden).toBe(true);
        await act(async () => presentation.setFullChat(false));
        expect(widgets.hidden).toBe(false);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});
