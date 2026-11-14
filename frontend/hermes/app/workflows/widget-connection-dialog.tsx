// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useState } from "react";
import type { WorkflowWidget, WorkflowWidgetConfiguration } from "../../../util/workflow-widget";
import { workflowWidgetParameters } from "../../../util/workflow-widget";

const FieldClass =
    "mt-1 block w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
export function WidgetConnectionDialog({
    widget,
    pending,
    error,
    onClose,
    onConnect,
}: {
    widget: WorkflowWidget;
    pending: boolean;
    error: string;
    onClose: () => void;
    onConnect: (configuration: WorkflowWidgetConfiguration) => void;
}) {
    const id = useId();
    const [operation, setOperation] = useState(
        widget.view === "web" ? "browser_open_links" : widget.view === "sandbox" ? "sandbox_exec" : "widget_get_state"
    );
    const [urls, setUrls] = useState("");
    const [text, setText] = useState("");
    const [keys, setKeys] = useState("Enter");
    const [computerId, setComputerId] = useState("");
    const [computers, setComputers] = useState<{ id: string; label: string; ready: boolean }[]>([]);
    const [validation, setValidation] = useState("");
    useEffect(() => {
        if (widget.view !== "sandbox") return;
        let active = true;
        void window.hermesDesktop
            .api<typeof computers>({
                path: "/api/kronterm/n8n/command",
                method: "POST",
                body: { operation: "workspace-computers" },
            })
            .then((rows) => {
                if (active) setComputers(rows);
            })
            .catch(() => {
                if (active) setValidation("Could not load sandbox VMs. Reopen this connection to try again.");
            });
        return () => {
            active = false;
        };
    }, [widget.blockId, widget.view]);
    const sandboxAction = operation.startsWith("sandbox_");
    const links = operation === "browser_open_links" || operation === "sandbox_open_links";
    return (
        <Dialog.Root
            open
            onOpenChange={(open) => {
                if (!open && !pending) onClose();
            }}
        >
            <Dialog.Portal container={document.body}>
                <Dialog.Overlay className="fixed inset-0 z-[65000] bg-black/35" />
                <Dialog.Content
                    data-live-block-occluder=""
                    className="os-workflow-widget-connection fixed left-1/2 top-1/2 z-[65001] max-h-[min(640px,calc(100dvh-48px))] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-5 text-foreground shadow-2xl"
                >
                    <Dialog.Title className="text-base font-semibold">Connect {widget.label}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-xs text-foreground/65">
                        Choose what this widget does when the connected workflow runs.
                    </Dialog.Description>
                    <form
                        className="mt-4 flex flex-col gap-4"
                        aria-busy={pending}
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (pending) return;
                            const config = { operation, urls, text, keys, computerId };
                            try {
                                workflowWidgetParameters(widget.view, config);
                                setValidation("");
                                onConnect(config);
                            } catch (failure) {
                                setValidation(failure instanceof Error ? failure.message : String(failure));
                            }
                        }}
                    >
                        <label htmlFor={`${id}-action`} className="text-xs">
                            Action
                            <select
                                id={`${id}-action`}
                                className={`${FieldClass} cursor-pointer`}
                                value={operation}
                                disabled={pending}
                                onChange={(e) => {
                                    setOperation(e.target.value);
                                    setValidation("");
                                }}
                            >
                                {widget.view === "web" && (
                                    <option value="browser_open_links">Open a link or group of links</option>
                                )}
                                {widget.view === "sandbox" && (
                                    <>
                                        <option value="sandbox_exec">Run command in VM</option>
                                        <option value="sandbox_open_links">Open URLs in VM</option>
                                        <option value="sandbox_run_task">Run AI task in VM</option>
                                    </>
                                )}
                                <option value="widget_get_state">Get widget state</option>
                                <option value="widget_snapshot">Capture widget snapshot</option>
                                {widget.view !== "sandbox" && (
                                    <>
                                        <option value="widget_type">Type text</option>
                                        <option value="widget_press">Press keys</option>
                                    </>
                                )}
                            </select>
                        </label>
                        {sandboxAction && (
                            <label htmlFor={`${id}-vm`} className="text-xs">
                                Sandbox VM
                                <select
                                    id={`${id}-vm`}
                                    className={`${FieldClass} cursor-pointer`}
                                    value={computerId}
                                    disabled={pending}
                                    onChange={(e) => setComputerId(e.target.value)}
                                    required
                                >
                                    <option value="">Choose an assigned VM</option>
                                    {computers.map((computer) => (
                                        <option key={computer.id} value={computer.id} disabled={!computer.ready}>
                                            {computer.label}
                                            {computer.ready ? "" : " (not ready)"}
                                        </option>
                                    ))}
                                </select>
                                <span className="mt-1 block text-foreground/60">
                                    Requires a running VM with Computer control enabled for this workspace.
                                </span>
                            </label>
                        )}
                        {links && (
                            <label htmlFor={`${id}-urls`} className="text-xs">
                                Links, one per line
                                <textarea
                                    id={`${id}-urls`}
                                    aria-label="Widget URLs"
                                    className={FieldClass}
                                    rows={4}
                                    value={urls}
                                    onChange={(e) => setUrls(e.target.value)}
                                    placeholder="https://example.com"
                                    required
                                    disabled={pending}
                                />
                                <span className="mt-1 block text-foreground/60">
                                    {operation === "browser_open_links"
                                        ? "The first link opens in this widget. Additional links open in separate browser widgets."
                                        : "Links open in the selected VM's browser."}
                                </span>
                            </label>
                        )}
                        {["widget_type", "sandbox_exec", "sandbox_run_task"].includes(operation) && (
                            <label htmlFor={`${id}-text`} className="text-xs">
                                {operation === "sandbox_exec"
                                    ? "Command"
                                    : operation === "sandbox_run_task"
                                      ? "AI task"
                                      : "Text"}
                                <textarea
                                    id={`${id}-text`}
                                    className={FieldClass}
                                    rows={4}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    required
                                    disabled={pending}
                                />
                            </label>
                        )}
                        {operation === "widget_press" && (
                            <label htmlFor={`${id}-keys`} className="text-xs">
                                Keys
                                <input
                                    id={`${id}-keys`}
                                    className={FieldClass}
                                    value={keys}
                                    onChange={(e) => setKeys(e.target.value)}
                                    required
                                    disabled={pending}
                                />
                            </label>
                        )}
                        {(validation || error) && (
                            <p role="alert" className="text-xs text-red-400">
                                {validation || error}
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={pending}
                                className="cursor-pointer rounded px-3 py-2 text-sm hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={pending}
                                className="cursor-pointer rounded bg-accent/80 px-3 py-2 text-sm text-primary hover:bg-accent disabled:opacity-50"
                            >
                                {pending ? "Connecting…" : "Connect widget"}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
