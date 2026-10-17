import { expect, it } from "vitest";
import { makeCanvasRequestCard } from "./workspace-canvas-agent";
import { arrangeTaskLineage, searchTaskNodes } from "./workspace-canvas-lineage";
it("arranges parents above siblings without changing context IDs", () => {
    const root = makeCanvasRequestCard("Inspect checkout", [], { x: 10, y: 20 });
    const a = makeCanvasRequestCard("Browser evidence", [root.id], { x: 10, y: 20 });
    const b = makeCanvasRequestCard("Build report", [root.id], { x: 10, y: 20 });
    const arranged = arrangeTaskLineage([root, a, b]);
    expect(arranged[1].y).toBeGreaterThan(arranged[0].y);
    expect(arranged[1].y).toBe(arranged[2].y);
    expect(arranged[2].x).toBeGreaterThan(arranged[1].x);
    expect(arranged[1].agent.contextids).toEqual([root.id]);
    expect(searchTaskNodes(arranged, "CHECKOUT").map((card) => card.id)).toEqual([root.id]);
});
