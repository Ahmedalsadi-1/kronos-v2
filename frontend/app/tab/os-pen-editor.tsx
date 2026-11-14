// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useSystemAppearance } from "@/app/components/system-ui";
import { ArrowLeft, Check, Download, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { makePenFrameClient, registerPenEditor } from "./os-pen-editor-bridge";
import { penDownload } from "./os-pen-export";
import "./os-pen-editor.css";

export function OSPenEditor({ tabId, visible, onClose }: { tabId: string; visible: boolean; onClose: () => void }) {
    const appearance = useSystemAppearance();
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    const [saved, setSaved] = useState(false);
    const clientRef = useRef<ReturnType<typeof makePenFrameClient>>(null);
    const url = new URL("./pen/editor/index.html", document.baseURI);
    url.searchParams.set("workspace", tabId);
    url.searchParams.set("theme", appearance.colorScheme);
    const [src] = useState(() => url.href);

    useEffect(() => {
        const frame = frameRef.current?.contentWindow;
        if (!frame) return;
        setStatus("loading");
        setError("");
        const client = makePenFrameClient(frame, new URL(src).origin);
        clientRef.current = client;
        let unregister: (() => void) | undefined;
        const timeout = setTimeout(() => {
            setStatus("error");
            setError("The editor did not finish starting. Retry to reconnect your saved design.");
        }, 45000);
        const receive = (event: MessageEvent) => {
            if (!client.receive(event)) return;
            const type = event.data.type ?? event.data.event;
            if (type === "ready") {
                clearTimeout(timeout);
                setStatus("ready");
                unregister?.();
                unregister = registerPenEditor(tabId, client.request);
            }
            if (type === "saved" || (type === "state" && event.data.status === "saved")) setSaved(true);
            if (type === "changed") setSaved(false);
            if (type === "storage-error") {
                setSaved(false);
                setError(String(event.data.error || "Could not save locally. Export a copy to keep your changes."));
            }
            if (type === "error") {
                clearTimeout(timeout);
                setError(String(event.data.error || "The editor could not start."));
                setStatus("error");
            }
        };
        window.addEventListener("message", receive);
        return () => {
            clearTimeout(timeout);
            unregister?.();
            window.removeEventListener("message", receive);
            client.dispose();
            clientRef.current = null;
        };
    }, [tabId, attempt, src]);

    useEffect(() => {
        if (status !== "ready") return;
        const styles = getComputedStyle(frameRef.current);
        void clientRef.current
            ?.request("set_theme", {
                theme: appearance.colorScheme,
                background: styles.getPropertyValue("--kt-content").trim(),
                accent: styles.getPropertyValue("--accent-color").trim(),
                reducedMotion: appearance.reducedMotion,
            })
            .catch(() => {});
    }, [appearance, status]);

    return (
        <section
            className="os-pen-editor"
            hidden={!visible}
            aria-label="Design editor"
            data-live-block-occluder=""
            data-workflow-native-host=""
        >
            <header className="os-pen-editor-header">
                <button type="button" onClick={onClose} title="Back to canvas">
                    <ArrowLeft size={16} />
                    <span>Canvas</span>
                </button>
                <strong>Design</strong>
                <span className="os-pen-editor-status" role="status">
                    {status === "ready" ? (
                        <>
                            <Check size={13} />
                            {saved ? "Saved locally" : "Local document"}
                        </>
                    ) : status === "loading" ? (
                        "Starting editor…"
                    ) : (
                        "Could not start"
                    )}
                </span>
                {status === "ready" && (
                    <button
                        type="button"
                        title="Export design and its assets"
                        onClick={async () => {
                            try {
                                const result = (await clientRef.current.request("export")) as Parameters<typeof penDownload>[0] & { warning?: string };
                                const file = penDownload(result);
                                const download = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
                                const anchor = document.createElement("a");
                                anchor.href = download;
                                anchor.download = file.name;
                                anchor.click();
                                setError(result.warning ?? "");
                                setTimeout(() => URL.revokeObjectURL(download), 1000);
                            } catch (err) {
                                setError(err instanceof Error ? err.message : "Export failed.");
                            }
                        }}
                    >
                        <Download size={15} />
                        <span>Export</span>
                    </button>
                )}
            </header>
            {status === "ready" && error && (
                <p className="px-3 py-1 text-[12px]" role="alert">
                    {error}
                </p>
            )}
            <iframe
                key={attempt}
                ref={frameRef}
                src={src}
                title="Pen design editor"
                name="kronos-pen-editor"
                sandbox="allow-scripts allow-same-origin allow-downloads"
            />
            {status !== "ready" && (
                <div className="os-pen-editor-startup">
                    {status === "loading" ? (
                        <LoaderCircle className="os-pen-editor-spinner" size={24} />
                    ) : (
                        <RotateCcw size={24} />
                    )}
                    <h2>{status === "loading" ? "Opening your design" : "Design needs attention"}</h2>
                    <p>{status === "loading" ? "Loading the editor, tools, and design skills." : error}</p>
                    {status === "error" && (
                        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                            Retry editor
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
