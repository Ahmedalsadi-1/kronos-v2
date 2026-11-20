// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { LinuxDesktop, VmHistory } from "@/types/linux-desktops";
import { useEffect, useId, useRef, useState } from "react";

export function VmHistoryPanel({
    desktop,
    onUpdate,
    onClose,
}: {
    desktop: LinuxDesktop;
    onUpdate: (desktop: LinuxDesktop) => void;
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [history, setHistory] = useState<VmHistory>();
    const [label, setLabel] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState("");
    const run = async (historyAction: "list" | "create" | "restore") => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const result = await getApi().performLinuxDesktopAction({
                desktopId: desktop.id,
                action: "history",
                historyAction,
                label,
                checkpointId: selected,
                expectedGeneration: desktop.controlGeneration,
            });
            if (result.success === false) throw new Error(result.error.message);
            setHistory(result.data.history);
            onUpdate(result.data.desktop);
            if (historyAction === "create") setLabel("");
            if (historyAction === "restore") setSelected("");
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "History unavailable.");
        } finally {
            setBusy(false);
        }
    };
    useEffect(() => {
        dialog.current?.showModal();
        void run("list");
    }, []);
    const controlled = desktop.controlOwner === "user";
    const checkpoints = [...(history?.checkpoints ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const selectedCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === selected);
    return (
        <dialog
            ref={dialog}
            onClose={onClose}
            aria-labelledby={titleId}
            className="m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[var(--kt-content)] p-0 text-[var(--kt-label)] shadow-2xl backdrop:bg-black/50"
        >
            <div className="flex max-h-[85vh] flex-col">
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                    <div>
                        <p className="mb-1 text-xs opacity-50">{desktop.name}</p>
                        <h2 id={titleId} className="text-base font-medium">
                            Checkpoint timeline
                        </h2>
                        <p className="mt-1 text-xs opacity-60">Save a moment. Return to it whenever you need.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => dialog.current?.close()}
                        aria-label="Close checkpoint timeline"
                        className="cursor-pointer rounded-lg p-2 opacity-60 transition-colors hover:bg-white/10 hover:opacity-100"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden="true"
                        >
                            <path d="m4 4 8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </header>
                <div className="min-h-0 overflow-y-auto px-5 py-5">
                    <div className="mb-5 flex items-center justify-between text-xs">
                        <span className="opacity-50">
                            {checkpoints.length} saved {checkpoints.length === 1 ? "checkpoint" : "checkpoints"}
                        </span>
                        <button
                            type="button"
                            className="cursor-pointer rounded px-2 py-1 opacity-60 hover:bg-white/10 hover:opacity-100 disabled:opacity-30"
                            disabled={busy}
                            onClick={() => void run("list")}
                        >
                            Refresh
                        </button>
                    </div>
                    {!busy && history?.checkpoints.length === 0 && (
                        <div className="py-8 text-center">
                            <p className="text-sm">Your timeline starts here</p>
                            <p className="mt-2 text-xs opacity-50">Save your first checkpoint below.</p>
                        </div>
                    )}
                    <ol className="m-0 list-none p-0" aria-label="Saved checkpoints">
                        {checkpoints.map((checkpoint, index) => {
                            const current = history?.head === checkpoint.id;
                            const parent = checkpoints.find((item) => item.id === checkpoint.parentId);
                            return (
                                <li key={checkpoint.id} className="relative pl-7 pb-3 last:pb-0">
                                    {index < checkpoints.length - 1 && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute bottom-0 left-[5px] top-5 w-px bg-white/15"
                                        />
                                    )}
                                    <span
                                        aria-hidden="true"
                                        className={
                                            current
                                                ? "absolute left-0 top-5 size-[11px] rounded-full bg-accent ring-4 ring-accent/15"
                                                : "absolute left-0 top-5 size-[11px] rounded-full border-2 border-white/30 bg-[var(--kt-content)]"
                                        }
                                    />
                                    <button
                                        type="button"
                                        aria-pressed={selected === checkpoint.id}
                                        disabled={busy}
                                        onClick={() => setSelected(checkpoint.id)}
                                        className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${selected === checkpoint.id ? "border-accent/50 bg-accent/10" : "border-transparent hover:border-white/10 hover:bg-white/5"}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="break-words text-sm font-medium">{checkpoint.label}</span>
                                            {current && (
                                                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                                                    Current checkpoint
                                                </span>
                                            )}
                                        </div>
                                        <time dateTime={checkpoint.createdAt} className="mt-1 block text-xs opacity-50">
                                            {new Date(checkpoint.createdAt).toLocaleString()}
                                        </time>
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-50">
                                            <span>{checkpoint.includesMemory ? "Disk + memory" : "Disk only"}</span>
                                            {parent && <span className="truncate">From {parent.label}</span>}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    {busy && (
                        <p role="status" className="mt-3 text-xs opacity-60">
                            Updating timeline…
                        </p>
                    )}
                    {error && (
                        <p role="alert" className="mt-3 text-xs text-red-400">
                            {error}
                        </p>
                    )}
                </div>
                <footer className="shrink-0 space-y-3 border-t border-white/10 bg-white/[0.02] px-5 py-4">
                    {!controlled && (
                        <p className="text-xs opacity-60">Take control of the VM to save or restore a checkpoint.</p>
                    )}
                    <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!busy && controlled && label.trim()) void run("create");
                        }}
                    >
                        <input
                            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs outline-none focus:border-accent/60"
                            aria-label="Checkpoint name"
                            placeholder="Name this moment…"
                            value={label}
                            maxLength={160}
                            onChange={(event) => setLabel(event.target.value)}
                        />
                        <button
                            type="submit"
                            className="cursor-pointer rounded-lg bg-accent/80 px-3 py-2 text-xs text-primary transition-colors hover:bg-accent disabled:opacity-40"
                            disabled={busy || !controlled || !label.trim()}
                        >
                            Save checkpoint
                        </button>
                    </form>
                    {selectedCheckpoint && (
                        <div className="space-y-2 border-t border-white/10 pt-3">
                            <p className="text-xs opacity-60">
                                Your current state is saved before restoring. External actions are not undone.
                            </p>
                            <button
                                type="button"
                                className="w-full cursor-pointer rounded-lg border border-accent/40 px-3 py-2 text-xs hover:bg-accent/10 disabled:opacity-40"
                                disabled={busy || !controlled}
                                onClick={() => void run("restore")}
                            >
                                Restore “{selectedCheckpoint.label}”
                            </button>
                        </div>
                    )}
                </footer>
            </div>
        </dialog>
    );
}
