import { expect, it } from "vitest";
import { updatePenTask } from "./pen-task-history";

it("keeps action order, updates captures without duplicates, and preserves owned tabs", () => {
    const task = { id: "task", title: "Research", status: "running" as const };
    let groups = updatePenTask([], task, ["new-browser"], { id: "first", title: "Navigate", timestamp: 1, status: "completed" });
    groups = updatePenTask(groups, task, ["new-file"], { id: "second", title: "Read", timestamp: 2, status: "completed" });
    groups = updatePenTask(groups, { ...task, status: "completed" }, [], { id: "first", title: "Navigate", timestamp: 1, status: "completed", image: "capture" });
    expect(groups[0].tabIds).toEqual(["new-browser", "new-file"]);
    expect(groups[0].actions.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(groups[0].actions[0].image).toBe("capture");
    expect(groups[0].status).toBe("completed");
});
