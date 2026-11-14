// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { DiagnosticEntry, DiagnosticFailure, DiagnosticReport } from "../frontend/types/diagnostics";

const MaxEntries = 50;
const ErrorKinds = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
]);
const Sources = new Set(["main", "renderer", "react", "child-process"]);

// Retain only shipped code locations. Error messages and arbitrary paths may contain user content.
export function diagnosticLocations(stack: unknown): string[] {
    if (typeof stack !== "string") return [];
    return [
        ...new Set(
            stack
                .slice(0, 16000)
                .split("\n")
                .slice(1)
                .flatMap((line) => {
                    const location = line.match(
                        /(?:[/\\]dist[/\\](main|preload|frontend)[/\\]|\/assets\/)([a-zA-Z0-9_./-]+\.m?js):(\d{1,8}):(\d{1,8})/
                    );
                    if (!location || location[2].includes("..")) return [];
                    return [`${location[1] ?? "frontend/assets"}/${location[2]}:${location[3]}:${location[4]}`];
                })
        ),
    ].slice(0, 12);
}

export class DiagnosticsStore {
    entries: DiagnosticEntry[] = [];

    constructor(
        public file: string,
        public metadata: Pick<DiagnosticReport, "version" | "platform" | "architecture" | "electron">
    ) {
        try {
            const saved = JSON.parse(readFileSync(file, "utf8"));
            if (Array.isArray(saved)) {
                this.entries = saved
                    .slice(-MaxEntries)
                    .filter(
                        (entry) =>
                            typeof entry?.id === "string" &&
                            /^[a-f0-9-]{36}$/.test(entry.id) &&
                            typeof entry.time === "string" &&
                            Number.isFinite(Date.parse(entry.time)) &&
                            Sources.has(entry.source) &&
                            (ErrorKinds.has(entry.kind) || entry.kind === "ProcessFailure") &&
                            Array.isArray(entry.locations) &&
                            entry.locations.length <= 12 &&
                            entry.locations.every(
                                (location) =>
                                    typeof location === "string" &&
                                    /^(main|preload|frontend)\/[a-zA-Z0-9_./-]+\.m?js:\d{1,8}:\d{1,8}$/.test(
                                        location
                                    ) &&
                                    !location.includes("..")
                            )
                    )
                    .map(({ id, time, source, kind, locations }) => ({ id, time, source, kind, locations }));
            }
        } catch {
            // Corrupt or missing diagnostics must never prevent a workspace from opening.
        }
    }

    record(failure: DiagnosticFailure): void {
        if (!failure || !Sources.has(failure.source)) return;
        const kind =
            failure.source === "child-process"
                ? "ProcessFailure"
                : ErrorKinds.has(failure.name)
                  ? failure.name
                  : "Error";
        const locations = diagnosticLocations(failure.stack);
        const previous = this.entries.at(-1);
        if (
            previous?.source === failure.source &&
            previous.kind === kind &&
            previous.locations.join() === locations.join() &&
            Date.now() - Date.parse(previous.time) < 5000
        )
            return;
        this.entries.push({
            id: randomUUID(),
            time: new Date().toISOString(),
            source: failure.source,
            kind,
            locations,
        });
        this.entries = this.entries.slice(-MaxEntries);
        this.persist();
    }

    report(): DiagnosticReport {
        return {
            product: "KronOS",
            ...this.metadata,
            collectedAt: new Date().toISOString(),
            automaticUploads: false,
            entries: structuredClone(this.entries),
        };
    }

    clear(): void {
        this.entries = [];
        this.persist();
    }

    persist(): void {
        try {
            writeFileSync(`${this.file}.tmp`, JSON.stringify(this.entries), { mode: 0o600 });
            renameSync(`${this.file}.tmp`, this.file);
        } catch {
            // Reporting is best effort, including on read-only or full disks.
        }
    }
}
