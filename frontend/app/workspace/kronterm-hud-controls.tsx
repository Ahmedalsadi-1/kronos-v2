// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemPopover } from "@/app/components/system-ui";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { desktopSelectionPrompt } from "@/app/view/hermes/selection-context";
import { getApi } from "@/store/global";
import { Crosshair, LogOut } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DesktopGrabPayload } from "../../types/desktop-grab";
import { kronTermHudController } from "./kronterm-hud-controller";
import { launchKronTermHudIsland } from "./kronterm-hud-islands";

export function DesktopGrabControl({ compact = false }: { compact?: boolean } = {}) {
    const [active, setActive] = useState(false);
    const [message, setMessage] = useState("");
    const [selection, setSelection] = useState<DesktopGrabPayload>(null);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [includeScreenshot, setIncludeScreenshot] = useState(false);
    const [depth, setDepth] = useState<"compact" | "full">("compact");
    const [destination, setDestination] = useState<"current" | "new">("current");
    useEffect(() => {
        if (!selection) return;
        const cancel = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || sending) return;
            event.preventDefault();
            setSelection(null);
            setMessage("");
        };
        window.addEventListener("keydown", cancel);
        return () => window.removeEventListener("keydown", cancel);
    }, [selection, sending]);
    const send = async () => {
        if (!selection || !comment.trim() || sending) return;
        setSending(true);
        setMessage("");
        try {
            await getApi().sendHermesSelection({
                text: desktopSelectionPrompt(selection, comment, depth),
                target: destination,
                ...(includeScreenshot && selection.screenshot
                    ? { images: [{ filename: "desktop-selection.png", dataUrl: selection.screenshot }] }
                    : {}),
            });
            setSelection(null);
            setMessage("Selection queued for Hermes.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not send selection.");
        } finally {
            setSending(false);
        }
    };
    useEffect(() => {
        if (!active) return;
        const cancel = (event: KeyboardEvent) => {
            if (event.key === "Escape") void getApi().cancelDesktopGrab();
        };
        window.addEventListener("keydown", cancel);
        return () => {
            window.removeEventListener("keydown", cancel);
            void getApi().cancelDesktopGrab();
        };
    }, [active]);
    const grab = async () => {
        if (active) {
            await getApi().cancelDesktopGrab();
            return;
        }
        setActive(true);
        setMessage("Click a desktop element to review its context. Escape cancels.");
        try {
            const result = await getApi().desktopGrab();
            if (result.status === "selected") {
                setSelection(result.payload);
                setComment("");
                setIncludeScreenshot(false);
            }
            setMessage(
                result.status === "selected"
                    ? "Review the selection and add a comment before sending."
                    : "Selection cancelled."
            );
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Desktop selection failed.");
        } finally {
            setActive(false);
        }
    };
    return (
        <span className="relative inline-flex">
            <button
                type="button"
                className={
                    compact
                        ? "os-system-entry cursor-pointer flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
                        : "cursor-pointer"
                }
                aria-label={active ? "Cancel desktop selection" : "Select desktop element"}
                aria-pressed={active}
                title={message || "Select desktop element"}
                onClick={() => void grab()}
            >
                <Crosshair size={16} aria-hidden="true" />
                {!compact && <span>Desktop</span>}
            </button>
            {selection && (
                <SystemPopover
                    role="dialog"
                    aria-label="Review desktop selection"
                    className="absolute top-full left-0 z-50 mt-2 w-80 max-w-[calc(100vw-24px)] max-h-[70vh] overflow-auto p-3 text-[13px]"
                >
                    <p className="font-semibold">
                        {selection.application} · {selection.window}
                    </p>
                    <p className="my-2">
                        {selection.role} · {selection.name}
                    </p>
                    {selection.screenshot && (
                        <img
                            src={selection.screenshot}
                            alt="Captured desktop element"
                            className="max-h-40 w-full object-contain"
                        />
                    )}
                    <details className="my-2">
                        <summary className="cursor-pointer">Context to send</summary>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
                            {desktopSelectionPrompt(selection, "", depth)}
                        </pre>
                    </details>
                    <fieldset className="grid gap-2">
                        <legend className="mb-2 font-medium">Selection settings</legend>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={includeScreenshot}
                                disabled={!selection.screenshot}
                                onChange={(event) => setIncludeScreenshot(event.target.checked)}
                            />{" "}
                            Include screenshot
                        </label>
                        {!selection.screenshot && (
                            <p className="text-xs text-[var(--kt-label-secondary)]">
                                {selection.screenshotOmitted === "sensitive-content"
                                    ? "Screenshot withheld for sensitive content."
                                    : "No screenshot is available for this selection."}
                            </p>
                        )}
                        <label className="flex items-center justify-between gap-2">
                            Context depth
                            <select
                                className="cursor-pointer rounded bg-[var(--kt-content)] p-1"
                                value={depth}
                                onChange={(event) => setDepth(event.target.value as typeof depth)}
                            >
                                <option value="compact">Compact</option>
                                <option value="full">Full control context</option>
                            </select>
                        </label>
                        <label className="flex items-center justify-between gap-2">
                            Destination
                            <select
                                className="cursor-pointer rounded bg-[var(--kt-content)] p-1"
                                value={destination}
                                onChange={(event) => setDestination(event.target.value as typeof destination)}
                            >
                                <option value="current">Current chat</option>
                                <option value="new">New chat</option>
                            </select>
                        </label>
                    </fieldset>
                    <textarea
                        aria-label="Selection comment"
                        autoFocus
                        maxLength={2000}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        className="my-2 w-full rounded border border-[var(--kt-separator)] bg-[var(--kt-content)] p-2 focus-visible:outline-[var(--kt-focus-ring)]"
                    />
                    {message && (
                        <p role="status" className="mb-2 text-xs text-[var(--kt-label-secondary)]">
                            {message}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <SystemButton
                            type="button"
                            disabled={sending || !comment.trim()}
                            onClick={() => void send()}
                            variant="filled"
                        >
                            {sending ? "Sending…" : "Send to Hermes"}
                        </SystemButton>
                        <SystemButton
                            type="button"
                            disabled={sending}
                            onClick={() => {
                                setSelection(null);
                                setMessage("");
                            }}
                        >
                            Cancel
                        </SystemButton>
                    </div>
                </SystemPopover>
            )}
            {message && !selection && (
                <span role="status" className="kt-system-popover absolute top-full left-0 mt-2 w-64 px-3 py-2 text-xs">
                    {message}
                </span>
            )}
        </span>
    );
}

export function KronTermHudControls({ onOpenWidgetCatalog }: { onOpenWidgetCatalog: () => void }) {
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const launch = async (view: "term" | "web" | "preview" | "sandbox") => {
        try {
            await launchKronTermHudIsland(
                view === "sandbox" ? "machines" : view === "preview" ? "files" : view === "term" ? "terminal" : "web",
                view === "sandbox" ? { machineKind: "desktop" } : {}
            );
        } catch (error) {
            console.warn(`HUD could not open ${view}`, error);
        }
    };

    const { geometry } = surface;
    const launcherStyle = {
        left: geometry.x + geometry.width / 2,
        top: geometry.y + geometry.height + 8,
    };

    return (
        <nav
            className="kronterm-hud-launchers pointer-events-auto fixed z-[116] flex -translate-x-1/2 gap-1.5 [&_button]:flex [&_button]:min-h-11 [&_button]:min-w-12 [&_button]:cursor-pointer [&_button]:flex-col [&_button]:items-center [&_button]:justify-center [&_button]:gap-1 [&_button]:rounded-xl [&_button]:border [&_button]:border-white/15 [&_button]:bg-zinc-950/95 [&_button]:px-2 [&_button]:text-white/90 [&_button]:shadow-lg [&_button:hover]:bg-zinc-800 [&_button:focus-visible]:outline-accent [&_span]:text-[9px]"
            style={launcherStyle}
            aria-label="KronTerm HUD applications"
        >
            <DesktopGrabControl />
            <button
                type="button"
                className="cursor-pointer"
                onClick={() => void launch("sandbox")}
                aria-label="Open Sandbox island"
            >
                <i className="fa-solid fa-desktop" aria-hidden="true" />
                <span>Sandbox</span>
            </button>
            <button type="button" onClick={() => void launch("web")} aria-label="Open Browser island">
                <i className="fa-solid fa-globe" aria-hidden="true" />
                <span>Browser</span>
            </button>
            <button type="button" onClick={() => void launch("preview")} aria-label="Open Files island">
                <i className="fa-solid fa-folder" aria-hidden="true" />
                <span>Files</span>
            </button>
            <button type="button" onClick={() => void launch("term")} aria-label="Open Terminal island">
                <i className="fa-solid fa-terminal" aria-hidden="true" />
                <span>Terminal</span>
            </button>
            <button type="button" onClick={onOpenWidgetCatalog} aria-label="Open Widget catalog">
                <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
                <span>Widget</span>
            </button>
            <button
                type="button"
                onClick={() => {
                    kronTermHudController.setActive(false);
                    hermesSurfaceController.dismiss();
                }}
                aria-label="Exit KronTerm HUD mode"
            >
                <LogOut aria-hidden="true" />
                <span>Exit HUD</span>
            </button>
        </nav>
    );
}
