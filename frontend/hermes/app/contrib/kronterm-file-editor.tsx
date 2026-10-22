import { CodeEditor } from "@hermes/components/chat/code-editor";
import type { HermesReadFileTextResult } from "@hermes/global";
import { desktopFsProfile } from "@hermes/lib/desktop-fs";
import { refreshReview } from "@hermes/store/review";
import { useEffect, useRef, useState } from "react";

export function KrontermFileEditor({ path, onDirtyChange }: { path: string; onDirtyChange: (dirty: boolean) => void }) {
    const [profile] = useState(desktopFsProfile);
    const [loaded, setLoaded] = useState<HermesReadFileTextResult>(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const baseline = useRef("");
    const draft = useRef("");
    const saveInFlight = useRef(false);
    const read = () =>
        window.hermesDesktop.api<HermesReadFileTextResult>({
            path: `/api/fs/read-text?path=${encodeURIComponent(path)}`,
            profile,
        });

    useEffect(() => {
        let active = true;
        read()
            .then((result) => {
                if (!active) return;
                if (result.binary || result.truncated) {
                    setError(
                        result.binary
                            ? "This is a binary file and cannot be edited as text."
                            : "This file is too large to edit safely."
                    );
                    return;
                }
                baseline.current = result.text;
                draft.current = result.text;
                setLoaded(result);
            })
            .catch((reason) => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
        };
    }, [path, profile]);

    const save = async () => {
        if (saveInFlight.current || !loaded || !dirty) return;
        saveInFlight.current = true;
        setSaving(true);
        setError("");
        try {
            const current = await read();
            if (current.binary || current.truncated || current.text !== baseline.current) {
                throw new Error(
                    "The file changed on disk. Your edits are preserved; reopen the file after copying them to resolve the conflict."
                );
            }
            const content = draft.current;
            await window.hermesDesktop.api({
                path: "/api/fs/write-text",
                method: "POST",
                profile,
                body: { path, content },
            });
            baseline.current = content;
            const stillDirty = draft.current !== content;
            setDirty(stillDirty);
            onDirtyChange(stillDirty);
            void refreshReview();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            saveInFlight.current = false;
            setSaving(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col" aria-label={`Editor ${path}`}>
            <div className="flex min-h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
                <span className="min-w-0 flex-1 truncate" title={path}>
                    {path}
                </span>
                <span role="status">{saving ? "Saving…" : dirty ? "Unsaved" : loaded ? "Saved" : ""}</span>
                <button
                    type="button"
                    className="cursor-pointer px-2 py-1 disabled:opacity-40"
                    disabled={!loaded || !dirty || saving}
                    onClick={() => void save()}
                >
                    Save
                </button>
            </div>
            {error && (
                <p role="alert" className="shrink-0 px-3 py-2 text-xs text-destructive">
                    {error}
                </p>
            )}
            {loaded ? (
                <CodeEditor
                    enhanced
                    className="min-h-0 flex-1"
                    filePath={path}
                    initialValue={loaded.text}
                    disabled={saving}
                    onChange={(value) => {
                        draft.current = value;
                        const next = value !== baseline.current;
                        setDirty(next);
                        onDirtyChange(next);
                    }}
                    onSave={() => void save()}
                />
            ) : (
                !error && (
                    <p role="status" className="p-3 text-xs">
                        Loading file…
                    </p>
                )
            )}
        </div>
    );
}
