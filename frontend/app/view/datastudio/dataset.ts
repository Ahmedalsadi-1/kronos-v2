// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Papa from "papaparse";

export const DataSizeLimit = 2 * 1024 * 1024;
export const DataRowLimit = 10000;
export const DataColumnLimit = 50;
export type Dataset = { filename: string; headers: string[]; rows: string[][] };
export type DataRow = { index: number; values: string[] };

export function parseDataset(content: string, filename: string): Dataset {
    if (new TextEncoder().encode(content).length > DataSizeLimit) throw new Error("CSV files must be at most 2 MB");
    const parsed = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
    const errors = parsed.errors.filter((error) => error.code !== "UndetectableDelimiter");
    if (errors.length) throw new Error(`CSV parse failed: ${errors[0].message}`);
    if (!parsed.data.length) throw new Error("CSV is empty");
    const [headers, ...rows] = parsed.data;
    if (!headers.length || headers.length > DataColumnLimit) throw new Error("CSV supports up to 50 columns");
    if (rows.length > DataRowLimit) throw new Error("CSV supports up to 10,000 data rows");
    const invalid = rows.findIndex((row) => row.length !== headers.length);
    if (invalid >= 0)
        throw new Error(`CSV row ${invalid + 2} has ${rows[invalid].length} cells; expected ${headers.length}`);
    return { filename, headers, rows };
}

export function visibleRows(dataset: Dataset, search: string, column: number, descending: boolean): DataRow[] {
    const query = search.toLocaleLowerCase();
    const rows = dataset.rows
        .map((values, index) => ({ values, index }))
        .filter((row) => !query || row.values.some((value) => value.toLocaleLowerCase().includes(query)));
    if (column < 0) return rows;
    return rows.sort((left, right) => {
        const a = left.values[column];
        const b = right.values[column];
        const numeric = a.trim() && b.trim() && Number.isFinite(Number(a)) && Number.isFinite(Number(b));
        const comparison = numeric ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true });
        return (descending ? -comparison : comparison) || left.index - right.index;
    });
}

export function numericSummary(rows: DataRow[], column: number) {
    const numbers = rows
        .map((row) => row.values[column])
        .filter((value) => value?.trim() && Number.isFinite(Number(value)))
        .map(Number);
    if (!numbers.length) return null;
    return {
        count: numbers.length,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        mean: numbers.reduce((sum, n) => sum + n, 0) / numbers.length,
    };
}

export function exportDataset(dataset: Dataset, rows = dataset.rows): string {
    return Papa.unparse([dataset.headers, ...rows]);
}

export function validateDataset(value: unknown): Dataset {
    const data = value as Dataset;
    if (
        !data ||
        typeof data.filename !== "string" ||
        !Array.isArray(data.headers) ||
        !data.headers.length ||
        data.headers.length > DataColumnLimit ||
        data.headers.some((header) => typeof header !== "string") ||
        !Array.isArray(data.rows) ||
        data.rows.length > DataRowLimit ||
        data.rows.some(
            (row) =>
                !Array.isArray(row) ||
                row.length !== data.headers.length ||
                row.some((cell) => typeof cell !== "string")
        )
    )
        throw new Error("Invalid saved dataset");
    if (new TextEncoder().encode(JSON.stringify(data)).length > DataSizeLimit * 2)
        throw new Error("Saved dataset exceeds size limit");
    return data;
}
