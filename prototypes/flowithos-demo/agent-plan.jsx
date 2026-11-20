import React, { useId, useState } from "react";
import { Check, ChevronDown, ClipboardList, Pencil, Plus, X } from "lucide-react";
import { parsePlan, planMarkdown } from "./agent-plan-data";
import "./agent-plan.css";

const planLabels = {
    pending: "Plan Proposal",
    confirmed: "Plan Confirmed",
    cancelled: "Plan Cancelled",
    expired: "Plan Expired",
};

function PlanPreview({ plan, title }) {
    return <div className="agent-plan-preview">
        <h3>{plan.title ?? title}</h3>
        {plan.description.map((line, index) => <p key={index}>{line}</p>)}
        {plan.todos.length ? <ol>
            {plan.todos.map((todo, index) => <li key={index}>
                <strong>{todo.title}</strong>
                {todo.detail && <p>{todo.detail}</p>}
            </li>)}
        </ol> : <p className="agent-plan-subtle">No todos in this plan</p>}
    </div>;
}

export function AgentPlan({ task, onApprove, onReject, onRevise }) {
    const proposalId = useId();
    const [expanded, setExpanded] = useState(false);
    const [mode, setMode] = useState("Preview");
    const [draft, setDraft] = useState(null);
    const [newTodo, setNewTodo] = useState("");
    const [todoDetail, setTodoDetail] = useState("");
    const saved = planMarkdown(task);
    const markdown = draft ?? saved;
    const plan = parsePlan(markdown);
    const pending = (task.planState ?? "pending") === "pending";
    const canEdit = pending && Boolean(onRevise);
    const dirty = draft != null && draft !== saved;
    const valid = Boolean(plan.title || plan.description.length || plan.todos.length);

    function saveDraft() {
        if (dirty) {
            onRevise(markdown);
        }
        setDraft(null);
        setNewTodo("");
        setTodoDetail("");
    }

    function addTodo() {
        const title = newTodo.trim();
        if (!title) {
            return;
        }
        const detail = todoDetail.trim();
        const next = "- " + title + (detail ? " — " + detail : "");
        setDraft(markdown.trimEnd() + "\n" + next);
        setNewTodo("");
        setTodoDetail("");
    }

    function editTitle(title) {
        const heading = /^#[ \t]+.*$/m;
        const next = "# " + title;
        setDraft(heading.test(markdown) ? markdown.replace(heading, () => next) : next + "\n\n" + markdown);
    }

    function removeTodo(lineIndex) {
        setDraft(markdown.split("\n").filter((_, index) => index !== lineIndex).join("\n"));
    }

    return <section className="agent-plan" data-plan-state={task.planState ?? "pending"} aria-labelledby={proposalId + "-heading"}>
        <div className="agent-plan-header">
            <h2 id={proposalId + "-heading"}><ClipboardList size={15} />{planLabels[task.planState] ?? planLabels.pending}</h2>
            <span>{plan.todos.length} {plan.todos.length === 1 ? "todo" : "todos"}</span>
        </div>
        {!expanded && <div className="agent-plan-summary">
            <strong>{plan.title ?? task.title}</strong>
            <p>{pending ? "Review the expected plan before the agent starts." : task.planState === "confirmed"
                ? "The agent can now work through this plan."
                : task.planState === "expired" ? "Start a new proposal to continue." : "This plan was cancelled."}</p>
        </div>}
        <div className="agent-plan-actions">
            <button type="button" className="soft" aria-expanded={expanded} aria-controls={proposalId + "-body"} onClick={() => setExpanded(!expanded)}>
                <ChevronDown size={14} /> {expanded ? "Hide Full Plan" : "View Full Plan"}
            </button>
            {canEdit && draft == null && <button type="button" className="soft" onClick={() => {
                setDraft(saved);
                setMode("Split");
                setExpanded(true);
            }}><Pencil size={14} /> Edit Plan</button>}
        </div>
        <div id={proposalId + "-body"} hidden={!expanded}>
            {draft != null && <label className="agent-plan-todo-edit">
                <span>Plan Title</span>
                <input value={markdown.match(/^#[ \t]+(.*)$/m)?.[1] ?? ""} placeholder={task.title} onChange={(event) => editTitle(event.target.value)} />
            </label>}
            <div className="agent-plan-modes" role="group" aria-label="Plan view">
                {["Preview", "Source", "Split"].map((view) => <button key={view} type="button" aria-pressed={mode === view} onClick={() => setMode(view)}>{view}</button>)}
            </div>
            <div className="agent-plan-body" data-mode={mode}>
                {mode !== "Source" && <PlanPreview plan={plan} title={task.title} />}
                {mode !== "Preview" && (draft != null ? <label className="agent-plan-source">
                    <span>Plan description (Markdown)</span>
                    <textarea value={draft} rows={7} onChange={(event) => setDraft(event.target.value)} />
                </label> : <pre className="agent-plan-source">{markdown}</pre>)}
            </div>
            {draft != null && <div className="agent-plan-todo-edit">
                {plan.todos.length > 0 && <ul className="agent-plan-removable" aria-label="Edit plan todos">
                    {plan.todos.map((todo) => <li key={todo.lineIndex}>
                        <span>{todo.title}</span>
                        <button type="button" className="icon-button" aria-label={"Delete " + todo.title} onClick={() => removeTodo(todo.lineIndex)}><X size={13} /></button>
                    </li>)}
                </ul>}
                <label><span>Todo title</span><input value={newTodo} onChange={(event) => setNewTodo(event.target.value)} /></label>
                <label><span>Description (optional)</span><input value={todoDetail} onChange={(event) => setTodoDetail(event.target.value)} /></label>
                <button type="button" className="soft" disabled={!newTodo.trim()} onClick={addTodo}><Plus size={14} /> Add Todo</button>
            </div>}
        </div>
        {pending && <footer className="agent-plan-actions agent-plan-footer">
            {draft != null && <>
                {dirty && <span className="agent-plan-subtle" role="status">Unsaved changes</span>}
                <button type="button" className="soft" onClick={() => { setDraft(null); setNewTodo(""); setTodoDetail(""); }}>Discard Edits</button>
                <button type="button" className="soft" disabled={!dirty || !valid} onClick={saveDraft}>Save Changes</button>
            </>}
            {onReject && <button type="button" className="soft" onClick={onReject}>Cancel Plan</button>}
            {onApprove && <button type="button" className="agent-plan-confirm" disabled={!valid} onClick={() => {
                if (draft != null) {
                    saveDraft();
                }
                onApprove();
            }}><Check size={14} /> {dirty ? "Save & Confirm Plan" : expanded ? "Confirm and Continue" : "Confirm Plan"}</button>}
        </footer>}
    </section>;
}
