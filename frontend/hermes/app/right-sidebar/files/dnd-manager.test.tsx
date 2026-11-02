// @vitest-environment jsdom
import { act } from "react";
import { Tree } from "react-arborist";
import { DndProvider, useDrop } from "react-dnd";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { getFileTreeDndManager } from "./dnd-manager";

function WorkspaceDropTarget() {
    const [, drop] = useDrop(() => ({ accept: "file" }));
    return (
        <div
            ref={(element) => {
                drop(element);
            }}
        >
            Workspace
        </div>
    );
}

it("shares the real HTML5 backend across workspace roots, file trees, remounts, and module reloads", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const hosts = Array.from({ length: 3 }, () => document.body.appendChild(document.createElement("div")));
    const roots = hosts.map((host) => createRoot(host));
    const manager = getFileTreeDndManager();
    const renderTree = (key: string) => (
        <Tree key={key} dndManager={getFileTreeDndManager()} width={250} height={300} data={[{ id: key, name: key }]} />
    );
    try {
        await act(async () =>
            roots[0].render(
                <DndProvider manager={manager}>
                    <WorkspaceDropTarget />
                </DndProvider>
            )
        );
        await act(async () => roots[1].render(renderTree("first")));
        await act(async () => roots[2].render(renderTree("second")));
        await act(async () => roots[1].render(renderTree("remounted")));
        vi.resetModules();
        const reloaded = await import("./dnd-manager");
        expect(reloaded.getFileTreeDndManager()).toBe(manager);
        expect(hosts[1].textContent).toContain("remounted");
        expect(hosts[2].textContent).toContain("second");
    } finally {
        await act(async () => roots.forEach((root) => root.unmount()));
        hosts.forEach((host) => host.remove());
    }
});
