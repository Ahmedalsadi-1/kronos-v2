// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { atom, type PrimitiveAtom } from "jotai";
import { type Dataset, parseDataset, validateDataset } from "./dataset";
import { DataStudioView } from "./datastudio";

export class DataStudioModel implements ViewModel {
    viewType = "datastudio";
    viewComponent = DataStudioView;
    viewName = atom("Data Studio");
    viewIcon = atom("table");
    noPadding = atom(true);
    dataset = atom(null) as PrimitiveAtom<Dataset>;
    error = atom("");
    blockId: string;
    private storageKey: string;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
        this.storageKey = `kronterm.data-studio.v1.${blockId}`;
        try {
            const saved = window.localStorage.getItem(this.storageKey);
            if (saved) globalStore.set(this.dataset, validateDataset(JSON.parse(saved)));
        } catch (error) {
            globalStore.set(this.error, error instanceof Error ? error.message : "Saved dataset could not be loaded");
        }
    }
    save(dataset: Dataset) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(validateDataset(dataset)));
        globalStore.set(this.dataset, dataset);
        globalStore.set(this.error, "");
    }
    import(content: string, filename: string) {
        this.save(parseDataset(content, filename));
    }
    edit(row: number, column: number, value: string) {
        const data = globalStore.get(this.dataset);
        if (!data || !data.rows[row] || column < 0 || column >= data.headers.length)
            throw new Error("Cell no longer exists");
        const rows = [...data.rows];
        rows[row] = [...rows[row]];
        rows[row][column] = value;
        this.save({ ...data, rows });
    }
}
