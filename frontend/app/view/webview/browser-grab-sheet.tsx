import { SystemButton, SystemPopover } from "@/app/components/system-ui";
import { browserSelectionPrompt } from "@/app/view/hermes/selection-context";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import type { BrowserGrabController } from "./browser-grab-controller";

export function BrowserGrabSheet({ controller }: { controller: BrowserGrabController }) {
    const selection = useAtomValue(controller.selection);
    const intent = useAtomValue(controller.intent);
    const error = useAtomValue(controller.error);
    const message = useAtomValue(controller.message);
    const [settings, setSettings] = useAtom(controller.settings);
    const [comment, setComment] = useState("");
    const [annotationIntent, setAnnotationIntent] = useState<"fix" | "change" | "question" | "approve">("change");
    const [actionError, setActionError] = useState("");
    const [sending, setSending] = useState(false);
    useEffect(() => {
        if (!selection) return;
        setComment("");
        setActionError("");
        const cancel = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                void controller.setIntent(null);
            }
        };
        window.addEventListener("keydown", cancel);
        return () => window.removeEventListener("keydown", cancel);
    }, [selection, controller]);
    const action = async (fn: () => Promise<void>) => {
        try {
            setActionError("");
            await fn();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : "Action failed");
        }
    };
    if (!selection)
        return error ? (
            <SystemPopover role="alert" className="absolute bottom-3 left-3 z-50 p-3 text-xs">
                {error}
            </SystemPopover>
        ) : null;
    return (
        <SystemPopover
            role="dialog"
            aria-label={
                intent === "style" ? "Element styles" : intent === "annotate" ? "Annotate element" : "Element actions"
            }
            className="absolute left-1/2 top-4 z-50 max-h-[calc(100%-32px)] w-[360px] max-w-[95%] -translate-x-1/2 overflow-auto p-4 text-[13px]"
        >
            <p className="mb-3 truncate font-semibold">
                {selection.target.reactComponents || selection.target.tagName} · {selection.target.selector}
            </p>
            <p className="mb-2 break-words text-xs text-[var(--kt-label-secondary)]">
                {selection.page.title} · {selection.page.sanitizedUrl}
            </p>
            <p className="mb-2 whitespace-pre-wrap">{selection.target.textSnippet}</p>
            <details className="mb-3">
                <summary className="cursor-pointer">Context to send</summary>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
                    {browserSelectionPrompt(selection, "", settings.depth)}
                </pre>
            </details>
            {intent === "style" && (
                <details open className="mb-3">
                    <summary className="cursor-pointer">Computed styles</summary>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
                        {JSON.stringify(selection.target.computedStyles ?? {}, null, 2)}
                    </pre>
                </details>
            )}
            <fieldset className="mb-3 grid gap-2">
                <legend className="mb-2 font-medium">Selection settings</legend>
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="checkbox"
                        checked={settings.includeScreenshot}
                        onChange={(event) => setSettings({ ...settings, includeScreenshot: event.target.checked })}
                    />
                    Include screenshot
                </label>
                <label className="flex items-center justify-between gap-2">
                    Context depth
                    <select
                        className="cursor-pointer rounded border border-[var(--kt-separator)] bg-[var(--kt-content)] p-1"
                        value={settings.depth}
                        onChange={(event) =>
                            setSettings({ ...settings, depth: event.target.value as typeof settings.depth })
                        }
                    >
                        <option value="compact">Compact</option>
                        <option value="full">Full DOM and styles</option>
                    </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                    Destination
                    <select
                        className="cursor-pointer rounded border border-[var(--kt-separator)] bg-[var(--kt-content)] p-1"
                        value={settings.destination}
                        onChange={(event) =>
                            setSettings({ ...settings, destination: event.target.value as typeof settings.destination })
                        }
                    >
                        <option value="current">Current chat</option>
                        <option value="new">New chat</option>
                    </select>
                </label>
            </fieldset>
            <textarea
                autoFocus
                aria-label="Comment for Hermes"
                placeholder={
                    intent === "style"
                        ? "Describe the style change for Hermes…"
                        : "What should Hermes do with this element?"
                }
                maxLength={2000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="mb-2 w-full rounded-lg border border-[var(--kt-separator)] bg-[var(--kt-content)] p-2 focus-visible:outline-[var(--kt-focus-ring)]"
            />
            <SystemButton
                type="button"
                disabled={sending || !comment.trim()}
                variant="filled"
                className="mb-3"
                onClick={() => {
                    setSending(true);
                    void action(() => controller.sendToHermes(comment)).finally(() => setSending(false));
                }}
            >
                {sending ? "Sending…" : "Send to Hermes"}
            </SystemButton>
            <SystemButton
                type="button"
                className="mb-3"
                onClick={() => void action(async () => controller.saveResearchFinding(comment))}
            >
                Save finding
            </SystemButton>
            {intent === "annotate" ? (
                <>
                    <select
                        aria-label="Annotation intent"
                        className="mb-3 w-full cursor-pointer rounded-lg bg-[var(--kt-content)] p-2"
                        value={annotationIntent}
                        onChange={(e) => setAnnotationIntent(e.target.value as typeof annotationIntent)}
                    >
                        {["fix", "change", "question", "approve"].map((value) => (
                            <option key={value}>{value}</option>
                        ))}
                    </select>
                    <SystemButton
                        variant="tinted"
                        disabled={!comment.trim()}
                        onClick={() => {
                            controller.annotate(comment, annotationIntent);
                            setComment("");
                        }}
                    >
                        Add annotation
                    </SystemButton>
                </>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <SystemButton onClick={() => void action(() => controller.copyContext())}>
                        Copy context
                    </SystemButton>
                    <SystemButton
                        onClick={() => void action(() => navigator.clipboard.writeText(selection.target.htmlSnippet))}
                    >
                        Copy HTML
                    </SystemButton>
                    <SystemButton onClick={() => void action(() => controller.copyScreenshot())}>
                        Copy screenshot
                    </SystemButton>
                </div>
            )}
            <div className="mt-3 flex gap-2">
                <SystemButton onClick={() => void controller.rearm()}>Select another</SystemButton>
                <SystemButton onClick={() => void controller.setIntent(null)}>Done</SystemButton>
            </div>
            <p role={actionError ? "alert" : "status"} className="mt-2 text-xs text-[var(--kt-label-secondary)]">
                {actionError || message}
            </p>
        </SystemPopover>
    );
}
