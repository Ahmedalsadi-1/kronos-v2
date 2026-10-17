// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";
import { DataSizeLimit, exportDataset, numericSummary, visibleRows } from "./dataset";
import type { DataStudioModel } from "./datastudio-model";

const Control =
    "cursor-pointer rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2 py-1 text-xs disabled:opacity-50";
const PageSize = 100;

export function DataStudioView({ model }: ViewComponentProps<DataStudioModel>) {
    const appearance = useCoucouWorkbenchAppearance();
    const data = useAtomValue(model.dataset);
    const error = useAtomValue(model.error);
    const [search, setSearch] = useState("");
    const [sortColumn, setSortColumn] = useState(-1);
    const [descending, setDescending] = useState(false);
    const [column, setColumn] = useState(0);
    const [labelColumn, setLabelColumn] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const generation = useRef(0);
    const rows = useMemo(
        () => (data ? visibleRows(data, search, sortColumn, descending) : []),
        [data, search, sortColumn, descending]
    );
    const summary = useMemo(() => numericSummary(rows, column), [rows, column]);
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / PageSize) - 1));
    const points = rows
        .filter((row) => row.values[column]?.trim() && Number.isFinite(Number(row.values[column])))
        .slice(0, 24);
    const scale = Math.max(0, ...points.map((row) => Math.abs(Number(row.values[column])))) || 1;
    const act = (action: () => void) => {
        setStatus("");
        globalStore.set(model.error, "");
        try {
            action();
            return true;
        } catch (error) {
            globalStore.set(model.error, error instanceof Error ? error.message : "Data action failed");
            return false;
        }
    };
    const download = (filtered: boolean) =>
        act(() => {
            if (!data) return;
            const url = URL.createObjectURL(
                new Blob([exportDataset(data, filtered ? rows.map((row) => row.values) : data.rows)], {
                    type: "text/csv;charset=utf-8",
                })
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${data.filename.replace(/\.csv$/i, "")}${filtered ? "-filtered" : "-edited"}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            setStatus("CSV download requested. Check Downloads for the saved file.");
        });
    return (
        <section
            style={appearance}
            className="flex h-full flex-col gap-3 overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
            aria-label="Data Studio"
        >
            <header className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-medium">Data Studio</h2>
                <label className={Control}>
                    Import CSV
                    <input
                        aria-label="Import CSV"
                        type="file"
                        accept=".csv,text/csv"
                        disabled={loading}
                        className="sr-only"
                        onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            const request = ++generation.current;
                            setLoading(true);
                            setStatus("");
                            globalStore.set(model.error, "");
                            try {
                                if (file.size > DataSizeLimit) throw new Error("CSV files must be at most 2 MB");
                                const content = await file.text();
                                if (request !== generation.current) return;
                                model.import(content, file.name);
                                setSearch("");
                                setSortColumn(-1);
                                setColumn(0);
                                setLabelColumn(0);
                                setPage(0);
                                setStatus("CSV imported and saved locally in this widget");
                            } catch (error) {
                                globalStore.set(
                                    model.error,
                                    error instanceof Error ? error.message : "CSV import failed"
                                );
                            } finally {
                                if (request === generation.current) setLoading(false);
                            }
                        }}
                    />
                </label>
                {loading && (
                    <span role="status" className="text-xs">
                        Importing…
                    </span>
                )}
                <button className={Control} disabled={!data} onClick={() => download(false)}>
                    Export edited CSV
                </button>
                <button className={Control} disabled={!data || !rows.length} onClick={() => download(true)}>
                    Export filtered CSV
                </button>
            </header>
            <p className="text-xs text-[var(--coucou-secondary)]">
                Local CSV workspace · First row is the header · Up to 2 MB, 10,000 rows and 50 columns
            </p>
            {error && (
                <p role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
            {status && (
                <p role="status" className="text-xs text-[var(--coucou-secondary)]">
                    {status}
                </p>
            )}
            {!data ? (
                <p className="py-8 text-sm">Import a CSV to inspect, edit and chart your data.</p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span>
                            {data.filename} · {data.rows.length.toLocaleString()} rows · {data.headers.length} columns ·{" "}
                            {rows.length.toLocaleString()} matching
                        </span>
                        <input
                            aria-label="Filter rows"
                            placeholder="Filter any column"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(0);
                            }}
                            className="rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-2"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label>
                            Chart labels{" "}
                            <select
                                aria-label="Chart labels"
                                className={Control}
                                value={labelColumn}
                                onChange={(event) => setLabelColumn(Number(event.target.value))}
                            >
                                {data.headers.map((header, index) => (
                                    <option key={index} value={index}>
                                        {index + 1}. {header || "Unnamed"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Numeric column{" "}
                            <select
                                aria-label="Numeric column"
                                className={Control}
                                value={column}
                                onChange={(event) => setColumn(Number(event.target.value))}
                            >
                                {data.headers.map((header, index) => (
                                    <option key={index} value={index}>
                                        {index + 1}. {header || "Unnamed"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {summary ? (
                            <span>
                                {summary.count} numeric values · Min {summary.min.toLocaleString()} · Max{" "}
                                {summary.max.toLocaleString()} · Mean{" "}
                                {summary.mean.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                        ) : (
                            <span>No numeric values in this column</span>
                        )}
                    </div>
                    {points.length > 0 && (
                        <figure className="rounded border border-[var(--coucou-border)] p-3">
                            <figcaption className="mb-2 text-xs text-[var(--coucou-secondary)]">
                                First {points.length} numeric matching rows · Bar length shows absolute magnitude;
                                values retain their sign
                            </figcaption>
                            <div className="flex flex-col gap-1">
                                {points.map((row) => (
                                    <div
                                        key={row.index}
                                        className="grid grid-cols-[100px_1fr_80px] items-center gap-2 text-xs"
                                    >
                                        <span className="truncate" title={row.values[labelColumn]}>
                                            {row.values[labelColumn] || `Row ${row.index + 1}`}
                                        </span>
                                        <div className="h-3 rounded bg-[var(--coucou-card)]">
                                            <div
                                                className="h-3 rounded bg-[var(--coucou-accent)]"
                                                style={{
                                                    width: `${(Math.abs(Number(row.values[column])) / scale) * 100}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-right">{row.values[column]}</span>
                                    </div>
                                ))}
                            </div>
                        </figure>
                    )}
                    <div className="min-h-40 flex-1 overflow-auto rounded border border-[var(--coucou-border)]">
                        <table className="w-full border-collapse text-xs">
                            <thead className="sticky top-0 z-10 bg-[var(--coucou-card)]">
                                <tr>
                                    <th className="p-2">Row</th>
                                    {data.headers.map((header, index) => (
                                        <th
                                            key={index}
                                            className="p-2 text-left"
                                            aria-sort={
                                                sortColumn === index
                                                    ? descending
                                                        ? "descending"
                                                        : "ascending"
                                                    : "none"
                                            }
                                        >
                                            <button
                                                className="cursor-pointer whitespace-nowrap"
                                                onClick={() => {
                                                    setSortColumn(index);
                                                    setDescending(sortColumn === index ? !descending : false);
                                                    setPage(0);
                                                }}
                                            >
                                                {header || `Column ${index + 1}`}{" "}
                                                {sortColumn === index ? (descending ? "↓" : "↑") : ""}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(pageIndex * PageSize, (pageIndex + 1) * PageSize).map((row) => (
                                    <tr key={row.index} className="border-t border-[var(--coucou-border)]">
                                        <th className="p-2 text-[var(--coucou-secondary)]">{row.index + 1}</th>
                                        {row.values.map((value, index) => (
                                            <td key={index} className="p-1">
                                                <input
                                                    aria-label={`Row ${row.index + 1}, ${data.headers[index] || `column ${index + 1}`}`}
                                                    key={`${row.index}-${index}-${value}`}
                                                    defaultValue={value}
                                                    maxLength={64000}
                                                    className="w-40 rounded bg-transparent p-1 focus:bg-[var(--coucou-card)]"
                                                    onBlur={(event) => {
                                                        if (
                                                            event.target.value !== value &&
                                                            !act(() => model.edit(row.index, index, event.target.value))
                                                        )
                                                            event.target.value = value;
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter") event.currentTarget.blur();
                                                    }}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!rows.length && <p className="p-4 text-xs">No rows match this filter.</p>}
                    </div>
                    <footer className="flex items-center gap-3 text-xs">
                        <button className={Control} disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>
                            Previous
                        </button>
                        <span>
                            Page {pageIndex + 1} of {Math.max(1, Math.ceil(rows.length / PageSize))} · Edits save when
                            you leave the cell or press Enter
                        </span>
                        <button
                            className={Control}
                            disabled={(pageIndex + 1) * PageSize >= rows.length}
                            onClick={() => setPage(pageIndex + 1)}
                        >
                            Next
                        </button>
                    </footer>
                </>
            )}
        </section>
    );
}
