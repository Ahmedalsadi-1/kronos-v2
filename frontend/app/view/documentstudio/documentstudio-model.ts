// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { atom } from "jotai";
import { DocumentStudioView } from "./documentstudio";
import { emptyReport, type Report, ReportStore } from "./report";

export class DocumentStudioModel implements ViewModel {
    viewType = "documentstudio";
    viewComponent = DocumentStudioView;
    viewName = atom("Document Studio");
    viewIcon = atom("file-lines");
    noPadding = atom(true);
    report = atom(emptyReport());
    error = atom("");
    blockId: string;
    private store: ReportStore;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
        this.store = new ReportStore(
            {
                getItem: (key) => window.localStorage.getItem(key),
                setItem: (key, value) => window.localStorage.setItem(key, value),
            },
            `kronterm.document-studio.v1.${blockId}`
        );
        try {
            this.reload();
        } catch (error) {
            globalStore.set(this.error, error instanceof Error ? error.message : "Report could not be loaded");
        }
    }
    reload(): Report {
        const report = this.store.load();
        globalStore.set(this.report, report);
        globalStore.set(this.error, "");
        return report;
    }
    save(report: Report) {
        const saved = this.store.save(report, report.revision);
        globalStore.set(this.report, saved);
        globalStore.set(this.error, "");
        return saved;
    }
}
