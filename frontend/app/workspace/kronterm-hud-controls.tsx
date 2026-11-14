// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ScreenSelectorToolbar } from "@/app/lib/screen-selector-toolbar";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { desktopSelectionPrompt } from "@/app/view/hermes/selection-context";
import { getApi } from "@/store/global";
import { Crosshair, LogOut } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { DesktopGrabPayload } from "../../types/desktop-grab";
import { kronTermHudController } from "./kronterm-hud-controller";
import { launchKronTermHudIsland } from "./kronterm-hud-islands";

export function DesktopGrabControl({ compact = false }: { compact?: boolean } = {}) {
    const trigger = useRef<HTMLButtonElement>(null);
    const [operationId, setOperationId] = useState<string>();
    const [message, setMessage] = useState("");
    const [selection, setSelection] = useState<DesktopGrabPayload>(null);
    const [sending, setSending] = useState(false);
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
    const send = async (comment: string) => {
        if (!selection || !comment.trim() || sending) return;
        setSending(true);
        setMessage("");
        try {
            await getApi().sendHermesSelection({
                text: desktopSelectionPrompt(selection, comment, "compact"),
                target: "current",
                ...(selection.screenshot
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
        if (!operationId) return;
        const cancel = (event: KeyboardEvent) => {
            if (event.key === "Escape") void getApi().cancelDesktopGrab(operationId);
        };
        window.addEventListener("keydown", cancel);
        return () => {
            window.removeEventListener("keydown", cancel);
            void getApi().cancelDesktopGrab(operationId);
        };
    }, [operationId]);
    const grab = async () => {
        if (operationId) {
            await getApi().cancelDesktopGrab(operationId);
            return;
        }
        window.dispatchEvent(new Event("kronterm:workspace-picker-deactivate"));
        const id = crypto.randomUUID();
        setOperationId(id);
        setMessage("Click a desktop element to comment. Right-click to include an image. Escape cancels.");
        try {
            const result = await getApi().desktopGrab(id);
            if (result.status === "selected") {
                setSelection(result.payload);
            }
            setMessage(result.status === "selected" ? "" : "Selection cancelled.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Desktop selection failed.");
        } finally {
            setOperationId(undefined);
        }
    };
    const bounds = selection || (compact && message) ? trigger.current?.getBoundingClientRect() : null;
    const popoverPosition = bounds
        ? {
              position: "fixed" as const,
              zIndex: 2147483647,
              left: Math.max(12, Math.min(bounds.left, window.innerWidth - 332)),
              ...(bounds.top > window.innerHeight / 2
                  ? { top: "auto", bottom: window.innerHeight - bounds.top + 8 }
                  : { top: bounds.bottom + 8 }),
          }
        : undefined;
    const review =
        selection &&
        trigger.current &&
        createPortal(
            <div className="pointer-events-none fixed inset-0 z-[2147483647] [&>iframe]:pointer-events-auto">
                <ScreenSelectorToolbar
                    title="Desktop element comment"
                    prompt={{
                        x: (bounds.left + bounds.width / 2) / window.innerWidth,
                        y: (bounds.top + bounds.height / 2) / window.innerHeight,
                        label: selection.name || selection.role || selection.application,
                    }}
                    onComment={(text) => void send(text)}
                    onCancel={() => {
                        if (!sending) setSelection(null);
                    }}
                />
            </div>,
            document.body
        );
    const status = message && (
        <span
            role="status"
            style={popoverPosition}
            className="kt-system-popover pointer-events-none absolute top-full left-0 mt-2 w-64 px-3 py-2 text-xs"
        >
            {message}
        </span>
    );
    return (
        <span className="relative inline-flex" data-react-grab-ignore-events="">
            <button
                ref={trigger}
                type="button"
                className={
                    compact
                        ? "os-system-entry cursor-pointer flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
                        : "cursor-pointer"
                }
                aria-label={operationId ? "Cancel desktop selection" : "Select desktop element"}
                aria-pressed={Boolean(operationId)}
                title={message || "Select desktop element"}
                onClick={() => void grab()}
            >
                <Crosshair size={16} aria-hidden="true" />
                {!compact && <span>Desktop</span>}
            </button>
            {review}
            {compact && status ? createPortal(status, document.body) : status}
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
        left: `clamp(12px, ${geometry.x}px, max(12px, calc(100vw - 540px)))`,
        top: geometry.y + geometry.height + 8,
    };

    return (
        <nav
            className="kronterm-hud-launchers kt-hud-workspace-navigation pointer-events-auto fixed z-[116] flex"
            style={launcherStyle}
            aria-label="Bot Mode workspace navigation"
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
            <button
                type="button"
                onClick={() =>
                    void launchKronTermHudIsland("machines", { machineKind: "android", machinePicker: true }).catch(
                        (error) => console.warn("Could not open devices", error)
                    )
                }
                aria-label="Open Android and iOS devices"
            >
                <i className="fa-solid fa-mobile-screen" aria-hidden="true" />
                <span>Devices</span>
            </button>
            <button type="button" onClick={onOpenWidgetCatalog} aria-label="Open Widget catalog">
                <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
                <span>Widget</span>
            </button>
            <button
                type="button"
                onClick={() => {
                    kronTermHudController.setActive(false);
                    hermesSurfaceController.requestOpenChat();
                }}
                aria-label="Return to workspace with current chat"
            >
                <LogOut aria-hidden="true" />
                <span>Workspace</span>
            </button>
        </nav>
    );
}
