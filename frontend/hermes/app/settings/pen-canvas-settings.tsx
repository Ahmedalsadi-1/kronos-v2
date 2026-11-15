// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@hermes/components/ui/button";
import { Input } from "@hermes/components/ui/input";
import { Settings2 } from "@hermes/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ListRow, SettingsContent, SettingsSection, ToggleRow } from "./primitives";

export type PenCanvasSettingsRequest = (
    method: "get_settings" | "set_settings",
    params?: Record<string, unknown>
) => Promise<unknown>;
type SettingValue = boolean | number | string;
export type PenCanvasSettingField = {
    key: string;
    group: string;
    kind: "boolean" | "number" | "enum";
    label: string;
    description?: string;
    min?: number;
    max?: number;
    options?: Array<{ value: string | number; label: string }>;
};
export type PenCanvasSettingsSnapshot = {
    scope: "desktop-profile";
    fields: PenCanvasSettingField[];
    values: Record<string, SettingValue>;
};

export function readPenCanvasSettings(value: unknown): PenCanvasSettingsSnapshot {
    const snapshot = value as PenCanvasSettingsSnapshot;
    if (snapshot?.scope !== "desktop-profile" || !Array.isArray(snapshot.fields) || !snapshot.values)
        throw new Error("The canvas returned invalid settings.");
    for (const field of snapshot.fields) {
        if (
            !field ||
            typeof field.key !== "string" ||
            typeof field.label !== "string" ||
            typeof field.group !== "string"
        )
            throw new Error("The canvas returned an invalid setting.");
        const current = snapshot.values[field.key];
        const valid =
            field.kind === "boolean"
                ? typeof current === "boolean"
                : field.kind === "number"
                  ? typeof current === "number" && Number.isFinite(current)
                  : field.kind === "enum" &&
                    Array.isArray(field.options) &&
                    field.options.some((option) => option.value === current);
        if (!valid) throw new Error(`The canvas returned an invalid value for ${field.label}.`);
    }
    return snapshot;
}

function NumberSetting({
    field,
    value,
    disabled,
    onChange,
}: {
    field: PenCanvasSettingField;
    value: number;
    disabled: boolean;
    onChange: (value: number) => void;
}) {
    const [draft, setDraft] = useState(String(value));
    const [error, setError] = useState("");
    useEffect(() => setDraft(String(value)), [value]);
    return (
        <div>
            <Input
                className="w-28"
                type="number"
                aria-label={field.label}
                disabled={disabled}
                min={field.min}
                max={field.max}
                step="any"
                value={draft}
                onChange={(event) => {
                    setDraft(event.target.value);
                    setError("");
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={() => {
                    const next = Number(draft);
                    if (!draft.trim() || !Number.isFinite(next) || next < field.min || next > field.max) {
                        setDraft(String(value));
                        setError(`Enter a number from ${field.min} to ${field.max}.`);
                        return;
                    }
                    if (next !== value) onChange(next);
                }}
            />
            {error && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

export function PenCanvasSettings({ request }: { request: PenCanvasSettingsRequest }) {
    const [snapshot, setSnapshot] = useState<PenCanvasSettingsSnapshot>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const generation = useRef(0);
    const load = useCallback(async () => {
        const current = ++generation.current;
        setBusy(true);
        setError("");
        try {
            const next = readPenCanvasSettings(await request("get_settings"));
            if (current === generation.current) setSnapshot(next);
        } catch (failure) {
            if (current === generation.current)
                setError(failure instanceof Error ? failure.message : "Could not load canvas settings.");
        } finally {
            if (current === generation.current) setBusy(false);
        }
    }, [request]);
    useEffect(() => {
        void load();
        return () => {
            generation.current++;
        };
    }, [load]);
    const update = async (key: string, value: SettingValue) => {
        const current = ++generation.current;
        setBusy(true);
        setError("");
        try {
            const next = readPenCanvasSettings(await request("set_settings", { patch: { [key]: value } }));
            if (current === generation.current) setSnapshot(next);
        } catch (failure) {
            if (current === generation.current)
                setError(failure instanceof Error ? failure.message : "Could not save canvas settings.");
        } finally {
            if (current === generation.current) setBusy(false);
        }
    };
    return (
        <SettingsContent>
            <div className="flex items-center justify-between gap-3 py-4">
                <div>
                    <h2 className="text-base font-medium">Canvas</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Shared across workspaces in this desktop profile. Changes apply immediately.
                    </p>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
                    Refresh
                </Button>
            </div>
            {error && (
                <p role="alert" className="mb-4 text-sm text-destructive">
                    {error}
                </p>
            )}
            {!snapshot && (
                <p role="status" className="py-3 text-sm text-muted-foreground">
                    {busy ? "Loading canvas settings…" : "Open the workspace canvas, then refresh to reconnect."}
                </p>
            )}
            {snapshot &&
                [...new Set(snapshot.fields.map((field) => field.group))].map((group) => (
                    <SettingsSection key={group} icon={Settings2} title={group}>
                        {snapshot.fields
                            .filter((field) => field.group === group)
                            .map((field) => {
                                const value = snapshot.values[field.key];
                                if (field.kind === "boolean")
                                    return (
                                        <ToggleRow
                                            key={field.key}
                                            label={field.label}
                                            description={field.description}
                                            checked={value as boolean}
                                            disabled={busy}
                                            onChange={(next) => void update(field.key, next)}
                                        />
                                    );
                                return (
                                    <ListRow
                                        key={field.key}
                                        title={field.label}
                                        description={field.description}
                                        action={
                                            field.kind === "number" ? (
                                                <NumberSetting
                                                    field={field}
                                                    value={value as number}
                                                    disabled={busy}
                                                    onChange={(next) => void update(field.key, next)}
                                                />
                                            ) : (
                                                <select
                                                    aria-label={field.label}
                                                    value={String(value)}
                                                    disabled={busy}
                                                    className="min-h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                                                    onChange={(event) => {
                                                        const option = field.options.find(
                                                            (option) => String(option.value) === event.target.value
                                                        );
                                                        if (option) void update(field.key, option.value);
                                                    }}
                                                >
                                                    {field.options.map((option) => (
                                                        <option key={String(option.value)} value={String(option.value)}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            )
                                        }
                                    />
                                );
                            })}
                    </SettingsSection>
                ))}
        </SettingsContent>
    );
}
