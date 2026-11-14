// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectRoomsPane, projectRoomUrl } from "./project-rooms";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const state = {
    origin: "http://127.0.0.1:8799",
    parentOrigin: "http://localhost:5173",
    rooms: [
        {
            id: "project-one",
            name: "Example",
            cwd: "/project",
            threadId: "thread-one",
            ready: true,
            working: true,
            members: [{ id: "builder", name: "Builder" }],
        },
    ],
};

it("only embeds an existing ready room on the managed loopback runtime", () => {
    expect(new URL(projectRoomUrl(state, "project-one")).searchParams.get("group")).toBe("project-one");
    expect(() => projectRoomUrl({ ...state, origin: "https://example.com" }, "project-one")).toThrow();
    expect(() => projectRoomUrl(state, "foreign")).toThrow();
});

it("reopens durable conversations and surfaces connection failures without discarding the room", async () => {
    const element = document.createElement("div");
    const root = createRoot(element);
    const previous = window.hermesDesktop;
    const command = vi.fn().mockResolvedValue(state);
    const openDesktop = vi.fn().mockResolvedValue(undefined);
    window.hermesDesktop = { ...previous, projectRooms: { command, openDesktop } };
    try {
        await act(async () => root.render(<ProjectRoomsPane />));
        expect(element.querySelector("iframe")?.title).toBe("Example project conversation");
        expect(command).toHaveBeenCalledWith({ action: "list" });
        const button = (label: string) =>
            [...element.querySelectorAll("button")].find((item) => item.textContent === label)!;
        await act(async () => button("Shared desktop").click());
        expect(openDesktop).toHaveBeenCalledWith("builder");
        command.mockRejectedValueOnce(new Error("Runtime disconnected"));
        await act(async () => button("Reconnect").click());
        expect(element.querySelector('[role="alert"]')?.textContent).toBe("Runtime disconnected");
        expect(element.querySelector("iframe")).not.toBeNull();
        expect(command.mock.calls.every(([input]) => input.action === "list")).toBe(true);
    } finally {
        await act(async () => root.unmount());
        window.hermesDesktop = previous;
    }
});
