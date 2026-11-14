// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Code2, Compass, FolderOpen, PenLine } from "@/app/components/system-ui/os-icons";
import { useEffect, useRef, useState } from "react";
import type { OSChannelSetupDraft } from "./os-channel-setup";

export const OSSpaceIdentities = [
    {
        id: "explore",
        name: "Explore",
        icon: Compass,
        color: "#467b88",
        background: "linear-gradient(145deg, #bddbd9, #53808f 55%, #233f57)",
    },
    {
        id: "build",
        name: "Build",
        icon: Code2,
        color: "#636aa2",
        background: "linear-gradient(150deg, #d9d7ec, #8389b3 55%, #3c466b)",
    },
    {
        id: "write",
        name: "Write",
        icon: PenLine,
        color: "#a36d56",
        background: "linear-gradient(145deg, #f0dbc8, #c09385 55%, #795d77)",
    },
    {
        id: "organize",
        name: "Organize",
        icon: FolderOpen,
        color: "#658369",
        background: "linear-gradient(145deg, #dce4ce, #93ac91 55%, #476a66)",
    },
] as const;

export function OSWorkspaceSetup({
    onClose,
    onCreate,
    initialName = "",
    initialIdentity = "build",
    initialChannel,
    editing = false,
}: {
    onClose: () => void;
    onCreate: (
        name: string,
        identity: (typeof OSSpaceIdentities)[number],
        channel?: OSChannelSetupDraft
    ) => Promise<void>;
    initialName?: string;
    initialIdentity?: string;
    initialChannel?: OSChannelSetupDraft;
    editing?: boolean;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const pending = useRef(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState(initialName);
    const [identityId, setIdentityId] = useState(initialIdentity);
    const [error, setError] = useState("");
    useEffect(() => {
        const opener = document.activeElement;
        dialogRef.current?.showModal();
        return () => {
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialogRef}
            className="os-workspace-setup m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-(--kt-separator) bg-(--kt-content) p-5 text-(--kt-label) backdrop:bg-black/50"
            aria-labelledby="os-workspace-setup-title"
            onCancel={(event) => {
                event.preventDefault();
                if (!pending.current) onClose();
            }}
        >
            <form
                className="flex flex-col gap-4"
                onSubmit={async (event) => {
                    event.preventDefault();
                    if (pending.current || !name.trim()) return;
                    const identity = OSSpaceIdentities.find((item) => item.id === identityId) ?? OSSpaceIdentities[1];
                    pending.current = true;
                    setSaving(true);
                    setError("");
                    try {
                        await onCreate(name.trim(), identity, initialChannel);
                    } catch (failure) {
                        setError(failure instanceof Error ? failure.message : "Could not save the workspace.");
                    } finally {
                        pending.current = false;
                        setSaving(false);
                    }
                }}
            >
                <h2 id="os-workspace-setup-title" className="text-base font-semibold">
                    {editing ? "Edit workspace" : "New workspace"}
                </h2>
                <label className="flex flex-col gap-1 text-sm">
                    Workspace name
                    <input
                        required
                        autoFocus
                        maxLength={200}
                        className="rounded border border-(--kt-separator) bg-transparent px-2 py-1.5"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                {!editing && (
                    <label className="flex flex-col gap-1 text-sm">
                        Workspace style
                        <select
                            className="cursor-pointer rounded border border-(--kt-separator) bg-(--kt-content) px-2 py-1.5"
                            value={identityId}
                            onChange={(event) => setIdentityId(event.target.value)}
                        >
                            {OSSpaceIdentities.map((identity) => (
                                <option key={identity.id} value={identity.id}>
                                    {identity.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {error && (
                    <p role="alert" className="text-sm text-error">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-2 text-sm">
                    <button
                        type="button"
                        className="kron-button kron-button-ghost cursor-pointer rounded px-3 py-1.5"
                        disabled={saving}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="kron-button kron-button-primary cursor-pointer rounded px-3 py-1.5"
                        disabled={saving || !name.trim()}
                    >
                        {editing ? "Save changes" : "Create workspace"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
