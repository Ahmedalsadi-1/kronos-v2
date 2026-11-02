import { createDragDropManager, type DragDropManager } from "dnd-core";
import { HTML5Backend } from "react-dnd-html5-backend";

const ManagerKey = Symbol.for("kronterm.renderer.drag-drop-manager");

// Separate React roots and hot reloads must retain the same owner of the window's HTML5 backend.
export function getFileTreeDndManager(): DragDropManager {
    const scope = globalThis as typeof globalThis & { [ManagerKey]?: DragDropManager };
    return (scope[ManagerKey] ??= createDragDropManager(HTML5Backend));
}
