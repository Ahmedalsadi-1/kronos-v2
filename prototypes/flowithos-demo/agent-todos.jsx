import React from "react";
import { CheckCircle2, Circle, CircleAlert, CircleX, ClipboardList, Clock3, LoaderCircle, Pause } from "lucide-react";
import { sites } from "./samples";
import { planSteps } from "./agent-plan-data";
import "./agent-todos.css";

const TaskStatuses = {
    planning: { label: "Neo is thinking…", icon: LoaderCircle, tone: "active", spins: true },
    "needs-review": { label: "Waiting for plan confirmation…", icon: Clock3, tone: "active" },
    running: { label: "Agent is working", icon: LoaderCircle, tone: "active", spins: true },
    paused: { label: "Paused", icon: Pause, tone: "paused" },
    wrapping: { label: "Neo is wrapping up…", icon: LoaderCircle, tone: "active", spins: true },
    done: { label: "Completed", icon: CheckCircle2, tone: "complete" },
    failed: { label: "Failed", icon: CircleAlert, tone: "failed" },
    archived: { label: "Archived", icon: Circle, tone: "paused" },
    cancelled: { label: "Cancelled", icon: CircleX, tone: "paused" },
};

function AgentTaskStatus({ status }) {
    const { label, icon: Icon, tone, spins } = TaskStatuses[status] ?? { label: "Neo is ready.", icon: Circle, tone: "paused" };

    return (
        <span className={"task-state task-state-" + tone} role="status">
            <Icon aria-hidden="true" className={spins ? "task-state-spinner" : undefined} size={15} />
            {label}
        </span>
    );
}

function AgentTodos({ task, onToggle }) {
    const stages = planSteps(task);
    const todoStates = stages.map((_, index) => task.todoOverrides?.[index] ?? index < task.progress);
    const count = todoStates.filter(Boolean).length;
    const currentTodo = task.status === "running" ? task.progress : null;
    const source = sites[task.source];
    const waiting = [
        "planning",
        "needs-review",
    ].includes(task.status);
    const summary = waiting
        ? "Waiting for tasks…"
        : stages.length && count === stages.length
          ? "All tasks completed"
          : currentTodo != null && !todoStates[currentTodo] && currentTodo < stages.length
            ? "1 running"
            : null;

    return (
        <section className="agent-todos" aria-label="Todo List">
            <header className="agent-todos-header">
                <h2><ClipboardList aria-hidden="true" size={16} /> Todo List</h2>
                <span aria-label={count + " of " + stages.length + " completed"}>{count}/{stages.length}</span>
            </header>
            <progress aria-label="To-do completion" max={Math.max(1, stages.length)} value={count} />
            {summary && <p className="agent-todo-summary" role="status">{summary}</p>}
            {waiting || !stages.length ? <p className="agent-todo-empty">No todos created yet</p> : (
                <ul className="agent-todo-list">
                    {stages.map(([title, description], index) => {
                        const checked = todoStates[index];
                        const running = currentTodo === index && !checked;
                        const detail = !task.planRevision && index === 1 && source ? "Inspect example entries from " + source.title + "." : description;
                        return (
                            <li key={index} className="agent-todo-item" data-done={checked} data-running={running}>
                                <label>
                                    <input type="checkbox" checked={checked} onChange={() => onToggle(index)} />
                                    <span className="agent-todo-text">
                                        <span>{title}</span>
                                        <small>{detail}</small>
                                    </span>
                                </label>
                                <span className="agent-todo-badge">{checked ? "Done" : running ? "Running" : "Pending"}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export { AgentTaskStatus, AgentTodos };
