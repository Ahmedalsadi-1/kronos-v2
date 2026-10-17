// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import { useEffect, useState } from "react";
import type { MachineSection } from "./linux-vms";

type MachineChoice = { id: string; name: string; section: MachineSection; status: string };

export function MachinePicker({ onChoose }: { onChoose: (section: MachineSection, id: string) => void }) {
    const [section, setSection] = useState<MachineSection>("desktop");
    const [choices, setChoices] = useState<MachineChoice[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let disposed = false;
        void Promise.allSettled([getApi().listLinuxDesktops(), getApi().listComputerTargets()]).then((results) => {
            if (disposed) return;
            const rows: MachineChoice[] = [];
            const problems: string[] = [];
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result.status == "rejected") {
                    problems.push(String(result.reason));
                    continue;
                }
                if (result.value.success === false) {
                    problems.push(result.value.error.message);
                    continue;
                }
                for (const target of result.value.data)
                    rows.push({
                        id: target.id,
                        name: target.name,
                        status: target.status,
                        section:
                            i == 0
                                ? "desktop"
                                : "kind" in target && target.kind.startsWith("android")
                                  ? "android"
                                  : "iphone",
                    });
            }
            setChoices(rows);
            setError(problems.join(" · "));
            setLoading(false);
        });
        return () => {
            disposed = true;
        };
    }, []);
    return (
        <div className="flex h-full items-center justify-center p-4">
            <div
                role="dialog"
                aria-label="Choose a device"
                className="w-full max-w-sm rounded-2xl border border-[var(--kt-separator)] bg-[var(--kt-content)] p-4 shadow-xl"
            >
                <h2 className="mb-3 text-sm font-medium">Open a device</h2>
                <div className="mb-3 flex gap-2" role="tablist" aria-label="Device type">
                    {(["desktop", "android", "iphone"] as const).map((kind) => (
                        <button
                            key={kind}
                            role="tab"
                            aria-selected={section == kind}
                            className="cursor-pointer rounded-lg px-3 py-2 text-xs hover:bg-white/10"
                            onClick={() => setSection(kind)}
                        >
                            {kind == "desktop" ? "Linux VM" : kind == "android" ? "Android" : "iPhone"}
                        </button>
                    ))}
                </div>
                {choices
                    .filter((choice) => choice.section == section)
                    .map((choice) => (
                        <button
                            key={choice.id}
                            disabled={choice.status == "unavailable"}
                            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-3 text-left text-xs hover:bg-white/10 disabled:opacity-50"
                            onClick={() => onChoose(choice.section, choice.id)}
                        >
                            <span>{choice.name}</span>
                            <span className="opacity-60">{choice.status}</span>
                        </button>
                    ))}
                {!choices.some((choice) => choice.section == section) && (
                    <p className="py-3 text-xs opacity-60">
                        {loading
                            ? "Finding devices…"
                            : section == "iphone"
                              ? "No iPhone simulator found. Install full Xcode and an iOS simulator runtime."
                              : section == "android"
                                ? "No Android emulator found. Add a device in Android Studio."
                                : "No Linux runtime available."}
                    </p>
                )}
                {error && (
                    <p role="status" className="mt-2 text-xs opacity-60">
                        {error}
                    </p>
                )}
                <p className="mt-3 text-xs opacity-50">Opening a screen does not start the device.</p>
            </div>
        </div>
    );
}
