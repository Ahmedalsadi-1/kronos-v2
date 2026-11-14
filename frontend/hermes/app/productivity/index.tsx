// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import {
    emptyProductivityState,
    type ProductivityAction,
    type ProductivityState,
} from "../../../types/productivity";
import { clockLabel, focusRemaining, localDay, searchNotes } from "./model";

export type ProductivityApi = Pick<ElectronApi, "getProductivityState" | "updateProductivity" | "onProductivityState">;
const ButtonClass =
    "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline-2 disabled:opacity-50";
const InputClass = "min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2";
const PanelClass = "rounded-xl border border-border bg-background p-4";

export function ProductivityView({ api: overrideApi }: { api?: ProductivityApi } = {}) {
    const api = overrideApi ?? (window as unknown as { api?: ProductivityApi }).api;
    const [state, setState] = useState<ProductivityState>(emptyProductivityState);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [taskTitle, setTaskTitle] = useState("");
    const [taskId, setTaskId] = useState<string>();
    const [due, setDue] = useState("");
    const [habitTitle, setHabitTitle] = useState("");
    const [habitId, setHabitId] = useState<string>();
    const [target, setTarget] = useState(1);
    const [noteTitle, setNoteTitle] = useState("");
    const [noteBody, setNoteBody] = useState("");
    const [noteId, setNoteId] = useState<string>();
    const [query, setQuery] = useState("");
    const [focusLabel, setFocusLabel] = useState("Deep work");
    const [minutes, setMinutes] = useState(25);
    const [sites, setSites] = useState("");
    const [apps, setApps] = useState("");
    const savedSites = state.preferences.blockedSites.join(", ");
    const savedApps = state.preferences.blockedApps.join(", ");
    useEffect(() => {
        setSites(savedSites);
        setApps(savedApps);
    }, [savedSites, savedApps]);
    useEffect(() => {
        const routeQuery = window.location.hash.split("?")[1] ?? window.location.search;
        if (loading || new URLSearchParams(routeQuery).get("tab") !== "notes") return;
        const frame = window.requestAnimationFrame(() => {
            document.getElementById("productivity-notes")?.scrollIntoView({ block: "start" });
            document.querySelector<HTMLInputElement>('[aria-label="Note title"]')?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [loading]);
    useEffect(() => {
        if (!api?.getProductivityState) {
            setError("Productivity tools require the KronOS desktop runtime.");
            setLoading(false);
            return;
        }
        let alive = true;
        const accept = (value: ProductivityState) => {
            if (alive) setState(value);
        };
        let receivedLiveState = false;
        const off = api.onProductivityState((value) => {
            receivedLiveState = true;
            accept(value);
        });
        void api
            .getProductivityState()
            .then((value) => {
                if (!alive) return;
                if (receivedLiveState) return;
                accept(value);
                setSites(value.preferences.blockedSites.join(", "));
                setApps(value.preferences.blockedApps.join(", "));
            })
            .catch((e) => {
                if (alive) setError(String(e));
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            alive = false;
            off();
            clearInterval(timer);
        };
    }, [api]);
    async function update(action: ProductivityAction): Promise<boolean> {
        if (!api?.updateProductivity || busy) return false;
        setBusy(true);
        setError("");
        try {
            setState(await api.updateProductivity(action));
            return true;
        } catch (e) {
            setError(String(e));
            return false;
        } finally {
            setBusy(false);
        }
    }
    const focus = state.focus.find((row) => row.status === "running" || row.status === "paused");
    const today = localDay(new Date(now));
    const usable = !loading && !!api?.updateProductivity;
    const controlsDisabled = busy || !usable;
    const button = (label: string, action: ProductivityAction) => (
        <button type="button" className={ButtonClass} disabled={controlsDisabled} onClick={() => void update(action)}>
            {label}
        </button>
    );
    return (
        <main className="h-full overflow-y-auto bg-background p-5 text-foreground" aria-label="Productivity">
            <div className="mx-auto flex max-w-5xl flex-col gap-5">
                <header>
                    <h1 className="text-xl font-medium">Productivity</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        A quiet place for focus, reminders, habits, and ideas. Shared with your notch.
                    </p>
                </header>
                {error && (
                    <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
                        {error}
                    </p>
                )}
                {loading && <p role="status">Loading your workspace…</p>}
                <fieldset disabled={controlsDisabled} className="contents">
                    <section className={PanelClass} aria-label="Focus">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h2 className="font-medium">Focus</h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Pause whenever you need. Your elapsed focus time is preserved.
                                </p>
                            </div>
                            {focus && (
                                <div
                                    role="timer"
                                    aria-label="Focus time remaining"
                                    className="font-mono text-3xl tabular-nums"
                                >
                                    {clockLabel(focusRemaining(focus, now))}
                                </div>
                            )}
                        </div>
                        {focus ? (
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="mr-2 text-sm">
                                    {focus.label} · {focus.status}
                                </span>
                                {button(focus.status === "running" ? "Pause" : "Resume", {
                                    type: focus.status === "running" ? "focus.pause" : "focus.resume",
                                })}
                                {button("+5 minutes", { type: "focus.extend", minutes: 5 })}
                                {button("Stop", { type: "focus.stop" })}
                            </div>
                        ) : (
                            <form
                                className="mt-4 flex flex-wrap gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void update({ type: "focus.start", label: focusLabel, minutes });
                                }}
                            >
                                <input
                                    aria-label="Focus session name"
                                    className={`${InputClass} flex-1`}
                                    value={focusLabel}
                                    onChange={(e) => setFocusLabel(e.target.value)}
                                    required
                                    maxLength={200}
                                />
                                <input
                                    aria-label="Focus duration in minutes"
                                    className={`${InputClass} w-24`}
                                    type="number"
                                    min={1}
                                    max={1440}
                                    value={minutes}
                                    onChange={(e) => setMinutes(Number(e.target.value))}
                                    required
                                />
                                <button className={ButtonClass}>Start focus</button>
                            </form>
                        )}
                        {!!state.focus.length && (
                            <details className="mt-4 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">Session history</summary>
                                <ul className="mt-2 space-y-2">
                                    {state.focus.slice(0, 20).map((row) => (
                                        <li key={row.id}>
                                            {row.label} · {row.status} · {Math.floor(row.runningMs / 60000)} min focused
                                            · {new Date(row.startedAt).toLocaleString()}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </section>
                    <div className="grid gap-5 md:grid-cols-2">
                        <section className={PanelClass} aria-label="Tasks and reminders">
                            <h2 className="font-medium">Tasks & reminders</h2>
                            <form
                                className="mt-3 flex flex-col gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void update({
                                        type: "task.save",
                                        id: taskId,
                                        title: taskTitle,
                                        dueAt: due ? new Date(due).getTime() : undefined,
                                    }).then((ok) => {
                                        if (ok) {
                                            setTaskTitle("");
                                            setDue("");
                                            setTaskId(undefined);
                                        }
                                    });
                                }}
                            >
                                <input
                                    className={InputClass}
                                    aria-label="Task title"
                                    placeholder="What needs doing?"
                                    value={taskTitle}
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    required
                                    maxLength={500}
                                />
                                <div className="flex flex-wrap gap-2">
                                    <input
                                        className={`${InputClass} flex-1`}
                                        aria-label="Reminder date and time"
                                        type="datetime-local"
                                        value={due}
                                        onChange={(e) => setDue(e.target.value)}
                                    />
                                    <button className={ButtonClass}>{taskId ? "Save task" : "Add task"}</button>
                                </div>
                                {taskId && (
                                    <button
                                        type="button"
                                        className={ButtonClass}
                                        onClick={() => {
                                            setTaskId(undefined);
                                            setTaskTitle("");
                                            setDue("");
                                        }}
                                    >
                                        Cancel edit
                                    </button>
                                )}
                            </form>
                            {!state.tasks.length && (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    No tasks yet. Add a time to make one a reminder.
                                </p>
                            )}
                            <ul className="mt-4 space-y-3">
                                {state.tasks
                                    .filter((row) => row.status !== "deleted")
                                    .map((row) => (
                                        <li className="border-t border-border pt-3" key={row.id}>
                                            <div className="flex items-start justify-between gap-2">
                                                <span
                                                    className={`break-words text-sm ${row.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                                                >
                                                    {row.title}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{row.status}</span>
                                            </div>
                                            {row.dueAt != null && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {row.dueAt <= now && row.status === "open" ? "Due · " : ""}
                                                    {new Date(row.dueAt).toLocaleString()}
                                                </p>
                                            )}
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {button(row.status === "open" ? "Complete" : "Reopen", {
                                                    type: "task.status",
                                                    id: row.id,
                                                    status: row.status === "open" ? "completed" : "open",
                                                })}
                                                {row.status === "open" &&
                                                    button("Snooze 15m", {
                                                        type: "task.snooze",
                                                        id: row.id,
                                                        minutes: 15,
                                                    })}
                                                <button
                                                    type="button"
                                                    className={ButtonClass}
                                                    onClick={() => {
                                                        setTaskId(row.id);
                                                        setTaskTitle(row.title);
                                                        setDue(
                                                            row.dueAt != null
                                                                ? new Date(
                                                                      row.dueAt -
                                                                          new Date(row.dueAt).getTimezoneOffset() *
                                                                              60000
                                                                  )
                                                                      .toISOString()
                                                                      .slice(0, 16)
                                                                : ""
                                                        );
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                {button("Delete", {
                                                    type: "task.status",
                                                    id: row.id,
                                                    status: "deleted",
                                                })}
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                            {state.tasks.some((row) => row.status === "deleted") && (
                                <details className="mt-4">
                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                        Deleted tasks
                                    </summary>
                                    {state.tasks
                                        .filter((row) => row.status === "deleted")
                                        .map((row) => (
                                            <div
                                                className="mt-2 flex items-center justify-between gap-2 text-sm"
                                                key={row.id}
                                            >
                                                {row.title}
                                                {button("Restore", { type: "task.status", id: row.id, status: "open" })}
                                            </div>
                                        ))}
                                </details>
                            )}
                        </section>
                        <section className={PanelClass} aria-label="Habits">
                            <h2 className="font-medium">Habits</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Daily progress follows your local date.
                            </p>
                            <form
                                className="mt-3 flex flex-wrap gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void update({ type: "habit.save", id: habitId, title: habitTitle, target }).then(
                                        (ok) => {
                                            if (ok) {
                                                setHabitTitle("");
                                                setHabitId(undefined);
                                                setTarget(1);
                                            }
                                        }
                                    );
                                }}
                            >
                                <input
                                    className={`${InputClass} flex-1`}
                                    aria-label="Habit title"
                                    placeholder="A small daily practice"
                                    value={habitTitle}
                                    onChange={(e) => setHabitTitle(e.target.value)}
                                    required
                                    maxLength={200}
                                />
                                <input
                                    className={`${InputClass} w-20`}
                                    aria-label="Daily habit target"
                                    type="number"
                                    min={1}
                                    max={10000}
                                    value={target}
                                    onChange={(e) => setTarget(Number(e.target.value))}
                                    required
                                />
                                <button className={ButtonClass}>{habitId ? "Save habit" : "Add habit"}</button>
                                {habitId && (
                                    <button
                                        type="button"
                                        className={ButtonClass}
                                        onClick={() => {
                                            setHabitId(undefined);
                                            setHabitTitle("");
                                            setTarget(1);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </form>
                            {!state.habits.length && (
                                <p className="mt-4 text-sm text-muted-foreground">Build one habit at a time.</p>
                            )}
                            <ul className="mt-4 space-y-3">
                                {state.habits
                                    .filter((row) => !row.archived)
                                    .map((row) => (
                                        <li className="border-t border-border pt-3" key={row.id}>
                                            <div className="flex justify-between gap-2 text-sm">
                                                <span>{row.title}</span>
                                                <span>
                                                    {row.progress[today] ?? 0} / {row.target}
                                                </span>
                                            </div>
                                            <progress
                                                aria-label={`${row.title} daily progress`}
                                                className="mt-2 w-full accent-current"
                                                max={row.target}
                                                value={Math.min(row.target, row.progress[today] ?? 0)}
                                            />
                                            {row.snoozedUntil > now && (
                                                <p className="text-xs text-muted-foreground">
                                                    Snoozed until {new Date(row.snoozedUntil).toLocaleTimeString()}
                                                </p>
                                            )}
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {button("+1", {
                                                    type: "habit.progress",
                                                    id: row.id,
                                                    date: today,
                                                    delta: 1,
                                                })}
                                                {button("Undo", {
                                                    type: "habit.progress",
                                                    id: row.id,
                                                    date: today,
                                                    delta: -1,
                                                })}
                                                {button("Snooze 1h", { type: "habit.snooze", id: row.id, minutes: 60 })}
                                                <button
                                                    type="button"
                                                    className={ButtonClass}
                                                    onClick={() => {
                                                        setHabitId(row.id);
                                                        setHabitTitle(row.title);
                                                        setTarget(row.target);
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                {button("Archive", {
                                                    type: "habit.archive",
                                                    id: row.id,
                                                    archived: true,
                                                })}
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                            {state.habits.some((row) => row.archived) && (
                                <details className="mt-4">
                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                        Archived habits
                                    </summary>
                                    {state.habits
                                        .filter((row) => row.archived)
                                        .map((row) => (
                                            <div
                                                className="mt-2 flex items-center justify-between text-sm"
                                                key={row.id}
                                            >
                                                {row.title}
                                                {button("Restore", {
                                                    type: "habit.archive",
                                                    id: row.id,
                                                    archived: false,
                                                })}
                                            </div>
                                        ))}
                                </details>
                            )}
                        </section>
                    </div>
                    <section id="productivity-notes" className={PanelClass} aria-label="Notes">
                        <h2 className="font-medium">Notes</h2>
                        <form
                            className="mt-3 flex flex-col gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void update({ type: "note.save", id: noteId, title: noteTitle, body: noteBody }).then(
                                    (ok) => {
                                        if (ok) {
                                            setNoteTitle("");
                                            setNoteBody("");
                                            setNoteId(undefined);
                                        }
                                    }
                                );
                            }}
                        >
                            <input
                                className={InputClass}
                                aria-label="Note title"
                                placeholder="Give your idea a name"
                                value={noteTitle}
                                onChange={(e) => setNoteTitle(e.target.value)}
                                required
                                maxLength={500}
                            />
                            <textarea
                                className={InputClass}
                                aria-label="Note body"
                                placeholder="Capture a thought…"
                                rows={3}
                                value={noteBody}
                                onChange={(e) => setNoteBody(e.target.value)}
                                maxLength={100000}
                            />
                            <div className="flex gap-2">
                                <button className={ButtonClass}>{noteId ? "Save note" : "Capture note"}</button>
                                {noteId && (
                                    <button
                                        type="button"
                                        className={ButtonClass}
                                        onClick={() => {
                                            setNoteId(undefined);
                                            setNoteTitle("");
                                            setNoteBody("");
                                        }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                        <input
                            className={`${InputClass} mt-4 w-full`}
                            type="search"
                            aria-label="Search notes"
                            placeholder="Search titles and content"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {searchNotes(state.notes, query).map((row) => (
                                <article key={row.id} className="rounded-md border border-border p-3">
                                    <h3 className="break-words text-sm font-medium">{row.title}</h3>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                                        {row.body}
                                    </p>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            className={ButtonClass}
                                            onClick={() => {
                                                setNoteId(row.id);
                                                setNoteTitle(row.title);
                                                setNoteBody(row.body);
                                            }}
                                        >
                                            Edit
                                        </button>
                                        {button("Delete", { type: "note.delete", id: row.id, deleted: true })}
                                    </div>
                                </article>
                            ))}
                        </div>
                        {!searchNotes(state.notes, query).length && (
                            <p className="mt-3 text-sm text-muted-foreground">
                                {query ? "No matching notes." : "Your ideas will appear here."}
                            </p>
                        )}
                        {state.notes.some((row) => row.deleted) && (
                            <details className="mt-4">
                                <summary className="cursor-pointer text-xs text-muted-foreground">
                                    Deleted notes
                                </summary>
                                {state.notes
                                    .filter((row) => row.deleted)
                                    .map((row) => (
                                        <div className="mt-2 flex justify-between gap-2 text-sm" key={row.id}>
                                            {row.title}
                                            {button("Restore", { type: "note.delete", id: row.id, deleted: false })}
                                        </div>
                                    ))}
                            </details>
                        )}
                    </section>
                    <section className={PanelClass} aria-label="Focus boundaries and privacy">
                        <h2 className="font-medium">Focus boundaries & privacy</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Blocking applies during focus to KronOS managed browser and app launches. Other apps and
                            browsers stay outside its scope.
                        </p>
                        <form
                            className="mt-3 flex flex-col gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void update({
                                    type: "preferences.save",
                                    ...state.preferences,
                                    blockedSites: sites
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                    blockedApps: apps
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean),
                                });
                            }}
                        >
                            <input
                                className={InputClass}
                                aria-label="Blocked site hostnames"
                                placeholder="Site hostnames, separated by commas"
                                value={sites}
                                onChange={(e) => setSites(e.target.value)}
                            />
                            <input
                                className={InputClass}
                                aria-label="Blocked app identifiers"
                                placeholder="App identifiers or launcher names, separated by commas"
                                value={apps}
                                onChange={(e) => setApps(e.target.value)}
                            />
                            <button className={`${ButtonClass} self-start`}>Save boundaries</button>
                        </form>
                        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={state.preferences.activityEnabled}
                                onChange={(e) =>
                                    void update({
                                        type: "preferences.save",
                                        ...state.preferences,
                                        activityEnabled: e.target.checked,
                                    })
                                }
                            />
                            Keep local activity history
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Opt-in agent and focus event metadata. No screen recordings, message content, or keystrokes.
                        </p>
                        {!!state.activity.length && (
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs">
                                    Activity history ({state.activity.length})
                                </summary>
                                <ul className="mt-2 space-y-2 text-xs">
                                    {state.activity.slice(0, 50).map((row) => (
                                        <li key={row.id}>
                                            {row.label} · {row.kind} · {new Date(row.occurredAt).toLocaleString()}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3">
                                    {button("Clear activity history", { type: "activity.clear" })}
                                </div>
                            </details>
                        )}
                    </section>
                </fieldset>
            </div>
        </main>
    );
}
