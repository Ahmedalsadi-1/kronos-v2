import { makeTask } from "./samples";
import { planSteps } from "./agent-plan-data";

export const activeStatuses = ["planning", "needs-review", "running", "paused", "wrapping"];
export const terminalStatuses = ["done", "failed", "cancelled", "archived"];
export const timelineStatuses = ["planning", "running", "wrapping"];

export const walkthroughs = [
    { id: "proposal", label: "Plan proposal", title: "Compare research notebooks", status: "needs-review", progress: 0 },
    { id: "progress", label: "In progress", title: "Summarize the Hacker News feed", status: "running", progress: 1 },
    { id: "pause", label: "Paused", title: "Build a reading list from arXiv", status: "paused", progress: 2 },
    { id: "wrap", label: "Wrapping up", title: "Save the repository comparison", status: "wrapping", progress: 4 },
    { id: "complete", label: "Completed", title: "Draft a brief on local software", status: "done", progress: 4 },
    { id: "failure", label: "Failed", title: "Compare the archived project notes", status: "failed", progress: 2 },
    { id: "expired", label: "Plan expired", title: "Refresh an older research plan", status: "cancelled", progress: 0, planState: "expired" },
    { id: "cancel", label: "Cancelled", title: "Collect ideas for a city break", status: "cancelled", progress: 1 },
];

export function createAgentTask(title, options = {}) {
    return { ...makeTask(title), status: "planning", model: "Pro", todoOverrides: {}, ...options, updatedAt: Date.now() };
}

export function advanceTask(task, now) {
    if (!timelineStatuses.includes(task.status)) return task;
    const interval = task.status === "running" ? (task.model === "Fast" ? 850 : 2200)
        : task.status === "wrapping" ? 3800 : 1100;
    if (now - task.updatedAt < interval) return task;
    if (task.status === "planning") return { ...task, status: "needs-review", updatedAt: now };
    if (task.status === "wrapping") return { ...task, status: "done", updatedAt: now };
    const total = planSteps(task).length;
    const progress = Math.min(total, task.progress + 1);
    return { ...task, progress, status: progress === total ? "wrapping" : "running", updatedAt: now };
}

export function recoverTask(task) {
    if (task.status === "planning" || task.status === "running" || task.status === "wrapping") {
        return {
            ...task,
            status: task.status === "planning" ? "needs-review" : "paused",
            resumeStatus: task.status === "wrapping" ? "wrapping" : "running",
        };
    }
    return task;
}
