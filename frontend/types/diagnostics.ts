// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

export type DiagnosticSource = "main" | "renderer" | "react" | "child-process";

export interface DiagnosticFailure {
    source: DiagnosticSource;
    name?: string;
    stack?: string;
}

export interface DiagnosticEntry {
    id: string;
    time: string;
    source: DiagnosticSource;
    kind: string;
    locations: string[];
}

export interface DiagnosticReport {
    product: "KronOS";
    version: string;
    platform: string;
    architecture: string;
    electron: string;
    collectedAt: string;
    automaticUploads: false;
    entries: DiagnosticEntry[];
}
