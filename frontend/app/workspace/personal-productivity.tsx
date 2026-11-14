// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import type { ProductivityAction, ProductivityState } from "../../types/productivity";
import { useCoucouWorkbenchAppearance } from "./coucou-workbench-appearance";

export type PersonalProductivityBridge = {
    getProductivityState: () => Promise<ProductivityState>;
    updateProductivity: (action: ProductivityAction) => Promise<ProductivityState>;
    onProductivityState: (callback: (state: ProductivityState) => void) => () => void;
};

export function PersonalProductivity({ api }: { api: PersonalProductivityBridge }) {
    const appearance = useCoucouWorkbenchAppearance();
    const [state, setState] = useState<ProductivityState>();
    const [tab, setTab] = useState<"tasks" | "notes" | "focus" | "habits">("tasks");
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [noteId, setNoteId] = useState<string>();
    const [minutes, setMinutes] = useState(25);
    const [due, setDue] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(Date.now());
    const generation = useRef(0);
    useEffect(() => {
        let alive = true;
        const revision = generation.current;
        api.getProductivityState()
            .then((value) => {
                if (alive && revision === generation.current) setState(value);
            })
            .catch((err) => {
                if (alive) setError(String(err));
            });
        const dispose = api.onProductivityState((value) => {
            generation.current++;
            if (alive) setState(value);
        });
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            alive = false;
            dispose();
            window.clearInterval(timer);
        };
    }, [api]);
    const act = async (action: ProductivityAction): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        setError("");
        try {
            setState(await api.updateProductivity(action));
            return true;
        } catch (err) {
            setError(String(err));
            return false;
        } finally {
            setBusy(false);
        }
    };
    const button =
        "cursor-pointer rounded border border-[var(--coucou-border)] px-2 py-1 hover:bg-[var(--coucou-card)] disabled:opacity-50";
    const input = "w-full rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-3 py-2";
    const focus = state?.focus.find((row) => row.status === "running" || row.status === "paused");
    const remaining = focus
        ? Math.max(0, focus.remainingMs - (focus.status === "running" ? Math.max(0, now - focus.updatedAt) : 0))
        : 0;
    const seconds = Math.ceil(remaining / 1000);
    const day = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, "0")}-${String(new Date(now).getDate()).padStart(2, "0")}`;
    return (
        <section
            style={appearance}
            className="h-full overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
            aria-label="Personal workspace"
        >
            <nav className="mb-4 flex gap-2" aria-label="Personal tools">
                {(["tasks", "notes", "focus", "habits"] as const).map((name) => (
                    <button
                        key={name}
                        className={button}
                        aria-pressed={tab === name}
                        onClick={() => {
                            setTab(name);
                            setTitle("");
                            setBody("");
                            setNoteId(undefined);
                        }}
                    >
                        {name[0].toUpperCase() + name.slice(1)}
                    </button>
                ))}
            </nav>
            {error && (
                <p role="alert" className="mb-3 text-red-400">
                    {error}
                </p>
            )}
            {!state && <p>{error ? "Personal tools could not load." : "Loading personal tools…"}</p>}
            {state && (
                <div className="space-y-3">
                    {tab !== "focus" && (
                        <form
                            className="space-y-2"
                            onSubmit={async (event) => {
                                event.preventDefault();
                                const action: ProductivityAction =
                                    tab === "tasks"
                                        ? {
                                              type: "task.save",
                                              title,
                                              ...(due ? { dueAt: new Date(due).getTime() } : {}),
                                          }
                                        : tab === "notes"
                                          ? { type: "note.save", id: noteId, title, body }
                                          : { type: "habit.save", title, target: 1 };
                                if (await act(action)) {
                                    setTitle("");
                                    setBody("");
                                    setNoteId(undefined);
                                    setDue("");
                                }
                            }}
                        >
                            <input
                                aria-label={`${tab} title`}
                                className={input}
                                maxLength={300}
                                required
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder={
                                    tab === "notes"
                                        ? "Note title"
                                        : tab === "habits"
                                          ? "Daily habit"
                                          : "What needs doing?"
                                }
                            />
                            {tab === "notes" && (
                                <textarea
                                    aria-label="Note body"
                                    className={input}
                                    rows={5}
                                    maxLength={100000}
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                />
                            )}
                            {tab === "tasks" && (
                                <label className="flex items-center gap-2 text-sm">
                                    Reminder{" "}
                                    <input
                                        aria-label="Task reminder"
                                        className={input}
                                        type="datetime-local"
                                        value={due}
                                        onChange={(event) => setDue(event.target.value)}
                                    />
                                </label>
                            )}
                            <button className={button} disabled={busy}>
                                {noteId ? "Save note" : "Add"}
                            </button>
                            {noteId && (
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => {
                                        setNoteId(undefined);
                                        setTitle("");
                                        setBody("");
                                    }}
                                >
                                    Cancel edit
                                </button>
                            )}
                        </form>
                    )}
                    {tab === "tasks" && (
                        <ul className="space-y-2">
                            {state.tasks
                                .filter((task) => task.status !== "deleted")
                                .map((task) => (
                                    <li
                                        key={task.id}
                                        className="flex flex-wrap items-center gap-2 rounded bg-[var(--coucou-card)] p-2"
                                    >
                                        <label className="flex flex-1 items-center gap-2">
                                            <input
                                                type="checkbox"
                                                disabled={busy}
                                                checked={task.status === "completed"}
                                                onChange={() =>
                                                    void act({
                                                        type: "task.status",
                                                        id: task.id,
                                                        status: task.status === "completed" ? "open" : "completed",
                                                    })
                                                }
                                            />
                                            <span
                                                className={task.status === "completed" ? "line-through opacity-60" : ""}
                                            >
                                                {task.title}
                                            </span>
                                        </label>
                                        {task.dueAt != null && (
                                            <time className="text-xs">{new Date(task.dueAt).toLocaleString()}</time>
                                        )}
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() => void act({ type: "task.snooze", id: task.id, minutes: 15 })}
                                        >
                                            Snooze 15m
                                        </button>
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() =>
                                                void act({ type: "task.status", id: task.id, status: "deleted" })
                                            }
                                        >
                                            Trash
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    )}
                    {tab === "tasks" && state.tasks.some((task) => task.status === "deleted") && (
                        <details>
                            <summary className="cursor-pointer">Trash</summary>
                            {state.tasks
                                .filter((task) => task.status === "deleted")
                                .map((task) => (
                                    <div key={task.id} className="flex items-center justify-between gap-2 py-2">
                                        <span>{task.title}</span>
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() =>
                                                void act({ type: "task.status", id: task.id, status: "open" })
                                            }
                                        >
                                            Restore
                                        </button>
                                    </div>
                                ))}
                        </details>
                    )}
                    {tab === "notes" &&
                        state.notes
                            .filter((note) => !note.deleted)
                            .map((note) => (
                                <article key={note.id} className="rounded bg-[var(--coucou-card)] p-3">
                                    <strong>{note.title}</strong>
                                    <p className="whitespace-pre-wrap py-2">{note.body}</p>
                                    <div className="flex gap-2">
                                        <button
                                            className={button}
                                            onClick={() => {
                                                setNoteId(note.id);
                                                setTitle(note.title);
                                                setBody(note.body);
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() =>
                                                void act({ type: "note.delete", id: note.id, deleted: true })
                                            }
                                        >
                                            Trash
                                        </button>
                                    </div>
                                </article>
                            ))}
                    {tab === "notes" && state.notes.some((note) => note.deleted) && (
                        <details>
                            <summary className="cursor-pointer">Trash</summary>
                            {state.notes
                                .filter((note) => note.deleted)
                                .map((note) => (
                                    <div key={note.id} className="flex justify-between py-2">
                                        <span>{note.title}</span>
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() =>
                                                void act({ type: "note.delete", id: note.id, deleted: false })
                                            }
                                        >
                                            Restore
                                        </button>
                                    </div>
                                ))}
                        </details>
                    )}
                    {tab === "habits" &&
                        state.habits
                            .filter((habit) => !habit.archived)
                            .map((habit) => (
                                <div
                                    key={habit.id}
                                    className="flex items-center gap-2 rounded bg-[var(--coucou-card)] p-3"
                                >
                                    <span className="flex-1">
                                        {habit.title} · {habit.progress[day] ?? 0}/{habit.target} today
                                    </span>
                                    <button
                                        className={button}
                                        disabled={busy}
                                        onClick={() =>
                                            void act({ type: "habit.progress", id: habit.id, date: day, delta: 1 })
                                        }
                                    >
                                        +1
                                    </button>
                                    <button
                                        className={button}
                                        disabled={busy}
                                        onClick={() =>
                                            void act({ type: "habit.progress", id: habit.id, date: day, delta: -1 })
                                        }
                                    >
                                        Undo
                                    </button>
                                    <button
                                        className={button}
                                        disabled={busy}
                                        onClick={() =>
                                            void act({ type: "habit.archive", id: habit.id, archived: true })
                                        }
                                    >
                                        Archive
                                    </button>
                                </div>
                            ))}
                    {tab === "focus" &&
                        (focus ? (
                            <div className="space-y-3">
                                <h2>{focus.label}</h2>
                                <output className="block text-4xl tabular-nums">
                                    {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                                </output>
                                <p>
                                    {remaining === 0
                                        ? "Session complete"
                                        : focus.status === "paused"
                                          ? "Paused — resume when ready"
                                          : "Focus in progress"}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        className={button}
                                        disabled={busy || remaining === 0}
                                        onClick={() =>
                                            void act({
                                                type: focus.status === "running" ? "focus.pause" : "focus.resume",
                                            })
                                        }
                                    >
                                        {focus.status === "running" ? "Pause" : "Resume"}
                                    </button>
                                    <button
                                        className={button}
                                        disabled={busy}
                                        onClick={() => void act({ type: "focus.stop" })}
                                    >
                                        Stop
                                    </button>
                                    <button
                                        className={button}
                                        disabled={busy || remaining === 0}
                                        onClick={() => void act({ type: "focus.extend", minutes: 5 })}
                                    >
                                        +5 minutes
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form
                                className="space-y-3"
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    await act({ type: "focus.start", label: title || "Focus", minutes });
                                }}
                            >
                                <input
                                    className={input}
                                    aria-label="Focus label"
                                    placeholder="Focus on…"
                                    maxLength={300}
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                />
                                <label className="flex items-center gap-2">
                                    Minutes
                                    <input
                                        className={input}
                                        aria-label="Focus minutes"
                                        type="number"
                                        min={1}
                                        max={1440}
                                        value={minutes}
                                        onChange={(event) => setMinutes(Number(event.target.value))}
                                    />
                                </label>
                                <button className={button} disabled={busy}>
                                    Start focus
                                </button>
                                <p className="text-sm text-[var(--coucou-secondary)]">
                                    Sessions pause when KronOS restarts.
                                </p>
                            </form>
                        ))}
                </div>
            )}
        </section>
    );
}
