// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PluginStorage } from "@hermes/contrib/plugin";
import { useEffect, useRef, useState } from "react";
import type { ProjectRoomState } from "../../../types/project-room";

export function projectRoomUrl(state: ProjectRoomState, id: string): string {
    const origin = new URL(state.origin);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password)
        throw new Error("Invalid project room runtime origin.");
    if (!state.rooms.some((room) => room.id === id && room.ready)) throw new Error("Project room is not ready.");
    const url = new URL("/kronterm-app", origin);
    url.searchParams.set("parentOrigin", state.parentOrigin);
    url.searchParams.set("group", id);
    url.searchParams.set("roomOnly", "1");
    return url.href;
}

export function ProjectRoomsPane({ storage }: { storage?: PluginStorage }) {
    const [state, setState] = useState<ProjectRoomState>();
    const [selected, setSelected] = useState(() => storage?.get("selected-project-room", "") ?? "");
    const [name, setName] = useState("");
    const [cwd, setCwd] = useState("");
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const pending = useRef(false);
    const mounted = useRef(false);
    const bridge = window.hermesDesktop?.projectRooms;
    useEffect(() => {
        if (selected) storage?.set("selected-project-room", selected);
    }, [selected, storage]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (!bridge) return;
        let disposed = false;
        setError("");
        void bridge.command({ action: "list" }).then(
            (next) => {
                if (disposed) return;
                setState(next);
                setSelected((current) =>
                    next.rooms.some((room) => room.id === current) ? current : (next.rooms[0]?.id ?? "")
                );
                setCreating(next.rooms.length === 0);
            },
            (reason) => {
                if (!disposed) setError(reason instanceof Error ? reason.message : "Project rooms could not connect.");
            }
        );
        return () => {
            disposed = true;
        };
    }, [bridge, attempt]);
    const create = async (roomName = name, folder = cwd) => {
        if (pending.current || !bridge) return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            const next = await bridge.command({ action: "create", name: roomName, cwd: folder });
            if (!mounted.current) return;
            setState(next);
            setSelected(next.selectedId ?? "");
            setCreating(false);
        } catch (reason) {
            if (mounted.current)
                setError(reason instanceof Error ? reason.message : "Project room setup failed. Retry to continue.");
        } finally {
            pending.current = false;
            if (mounted.current) setBusy(false);
        }
    };
    const room = state?.rooms.find((item) => item.id === selected);
    const url = room?.ready ? projectRoomUrl(state, room.id) : undefined;
    return (
        <section className="flex h-full min-h-0 flex-col text-foreground" aria-label="Project rooms">
            <header className="flex flex-wrap items-center gap-2 border-b border-(--ui-stroke-secondary) p-3">
                <label className="text-sm font-medium" htmlFor="project-room-select">
                    Project room
                </label>
                <select
                    id="project-room-select"
                    className="min-w-0 flex-1 cursor-pointer rounded border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-1 text-sm"
                    value={selected}
                    onChange={(event) => {
                        setSelected(event.target.value);
                        setCreating(false);
                    }}
                >
                    {!state?.rooms.length && <option value="">No rooms yet</option>}
                    {state?.rooms.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name}
                        </option>
                    ))}
                </select>
                <button
                    className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-(--ui-bg-secondary)"
                    onClick={() => setCreating(true)}
                >
                    New room
                </button>
                {room?.ready && room.members.length > 0 && (
                    <button
                        className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-(--ui-bg-secondary)"
                        onClick={() =>
                            void bridge
                                .openDesktop(room.members[0].id)
                                .catch((reason) =>
                                    setError(
                                        reason instanceof Error ? reason.message : "Shared desktop could not open."
                                    )
                                )
                        }
                    >
                        Shared desktop
                    </button>
                )}
                <button
                    className="cursor-pointer rounded px-2 py-1 text-sm hover:bg-(--ui-bg-secondary)"
                    onClick={() => setAttempt((value) => value + 1)}
                >
                    Reconnect
                </button>
            </header>
            {!bridge && (
                <p role="alert" className="p-4 text-sm">
                    Project rooms require the KronOS desktop runtime.
                </p>
            )}
            {error && (
                <p role="alert" className="border-b border-(--ui-stroke-secondary) p-3 text-sm text-red-500">
                    {error}
                </p>
            )}
            {bridge && !state && !error && (
                <p role="status" className="p-4 text-sm">
                    Connecting to project rooms…
                </p>
            )}
            {creating && bridge && (
                <form
                    className="mx-auto flex w-full max-w-xl flex-col gap-3 p-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                >
                    <h2 className="text-lg font-medium">A team for your project</h2>
                    <p className="text-sm text-(--ui-text-secondary)">
                        Researcher investigates, Builder leads and implements, and Reviewer checks the result. They
                        share a folder and hand work to each other in the room.
                    </p>
                    <label className="flex flex-col gap-1 text-sm">
                        Project name
                        <input
                            required
                            maxLength={100}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="rounded border border-(--ui-stroke-secondary) bg-transparent p-2"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        Project folder
                        <input
                            required
                            value={cwd}
                            onChange={(event) => setCwd(event.target.value)}
                            placeholder="/absolute/path/to/project"
                            className="rounded border border-(--ui-stroke-secondary) bg-transparent p-2"
                        />
                    </label>
                    <p className="text-xs text-(--ui-text-secondary)">
                        Reopening the same folder reuses its team and history. Agents use your configured model and ask
                        for tool approvals. Work continues when you close this pane.
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={busy}
                            className="cursor-pointer rounded bg-accent/80 px-3 py-2 text-sm text-primary transition-colors hover:bg-accent"
                        >
                            {busy ? "Preparing team…" : "Create project room"}
                        </button>
                        {room && (
                            <button
                                type="button"
                                className="cursor-pointer px-3 py-2 text-sm"
                                onClick={() => setCreating(false)}
                            >
                                Back to room
                            </button>
                        )}
                    </div>
                </form>
            )}
            {!creating && room && !room.ready && (
                <div className="p-4 text-sm">
                    <p>Room setup was interrupted. Continue setting up the saved team.</p>
                    <button
                        disabled={busy}
                        className="mt-2 cursor-pointer rounded bg-accent/80 px-3 py-2 text-primary"
                        onClick={() => void create(room.name, room.cwd)}
                    >
                        Finish setup
                    </button>
                </div>
            )}
            {!creating && url && (
                <iframe
                    key={`${url}:${attempt}`}
                    src={url}
                    title={`${room.name} project conversation`}
                    className="min-h-0 w-full flex-1 border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                    allow="clipboard-write"
                />
            )}
        </section>
    );
}
