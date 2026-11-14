// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { getApi } from "@/store/global";
import type { DiagnosticReport } from "@/types/diagnostics";
import { Clipboard, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import "./kronsettings-diagnostics.css";
import { SectionHeader, SettingsCard } from "./kronsettings-shared";

export function KronSettingsDiagnostics() {
    const [report, setReport] = useState<DiagnosticReport>();
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState("Loading local diagnostics...");
    const refresh = async () => {
        setPending(true);
        try {
            const next = await getApi().getDiagnosticReport();
            setReport(next);
            setStatus(
                next.entries.length
                    ? `${next.entries.length} recent failures stored on this device.`
                    : "No recent failures recorded."
            );
        } catch {
            setStatus("Diagnostics could not be read. Try refreshing.");
        } finally {
            setPending(false);
        }
    };
    useEffect(() => {
        void refresh();
    }, []);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
            setStatus("Support report copied. Review it before sharing it with the KronOS team.");
        } catch {
            setStatus("Copy failed. Select the report below and copy it manually.");
        }
    };
    const clear = async () => {
        setPending(true);
        try {
            await getApi().clearDiagnosticReport();
            await refresh();
            setStatus("Local diagnostic history cleared.");
        } catch {
            setStatus("History could not be cleared. Try again.");
        } finally {
            setPending(false);
        }
    };
    return (
        <SettingsCard className="kronos-diagnostics">
            <SectionHeader
                title="Diagnostics & support"
                icon="shield-halved"
                description="Stored on your device. Nothing is uploaded automatically."
            />
            <p className="text-sm leading-relaxed pb-4">
                Reports contain the app version, platform, failure type, and shipped code locations. They exclude error
                messages, API keys, conversations, terminal output, and personal file paths. Keep up to 50 recent
                failures locally, preview the report, then choose whether to share it.
            </p>
            <div className="flex flex-wrap gap-2 pb-3">
                <SystemButton type="button" variant="tinted" disabled={!report || pending} onClick={() => void copy()}>
                    <Clipboard size={16} aria-hidden="true" />
                    Copy support report
                </SystemButton>
                <SystemButton type="button" disabled={pending} onClick={() => void refresh()}>
                    <RefreshCw size={16} aria-hidden="true" />
                    Refresh
                </SystemButton>
                <SystemButton type="button" disabled={pending || !report?.entries.length} onClick={() => void clear()}>
                    <Trash2 size={16} aria-hidden="true" />
                    Clear history
                </SystemButton>
            </div>
            <p role="status" aria-live="polite" className="text-sm pb-3">
                {status}
            </p>
            {report && (
                <details>
                    <summary className="cursor-pointer py-2 text-sm focus-visible:outline-2">
                        Preview support report
                    </summary>
                    <textarea
                        aria-label="Support report"
                        readOnly
                        value={JSON.stringify(report, null, 2)}
                        className="mt-2 w-full min-h-48 resize-y rounded border p-3 font-mono text-xs"
                        style={{
                            background: "var(--kt-content)",
                            color: "var(--kt-label)",
                            borderColor: "var(--kt-separator)",
                        }}
                    />
                </details>
            )}
            <a
                className="mt-4 inline-flex min-h-9 items-center text-sm underline cursor-pointer focus-visible:outline-2"
                href="https://github.com/Ahmedalsadi-1/kronos-releases/issues/new?template=bug-report.yml"
                target="_blank"
                rel="noopener noreferrer"
            >
                Report a problem on GitHub
            </a>
            <p className="text-xs leading-relaxed pt-1">
                GitHub reports are public and require a GitHub account. Review all text and attachments before
                submitting.
            </p>
        </SettingsCard>
    );
}
