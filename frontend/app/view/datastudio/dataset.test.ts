// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import {
    DataRowLimit,
    DataSizeLimit,
    exportDataset,
    numericSummary,
    parseDataset,
    validateDataset,
    visibleRows,
} from "./dataset";

describe("Data Studio CSV", () => {
    test("retains quotes, duplicate headers, blank cells and unicode on export round trip", () => {
        const data = parseDataset('Name,Name,Count\n"A, B","line 1\nline 2",10\nCafé,,2', "input.csv");
        expect(data.headers).toEqual(["Name", "Name", "Count"]);
        expect(data.rows[0]).toEqual(["A, B", "line 1\nline 2", "10"]);
        expect(parseDataset(exportDataset(data), "input.csv")).toEqual(data);
    });
    test("filters all columns and sorts numeric strings while retaining original row identities", () => {
        const data = parseDataset("Name,Value\nAlpha,10\nBravo,2\nCharlie,-5", "input.csv");
        expect(visibleRows(data, "BRAVO", -1, false)).toEqual([{ index: 1, values: ["Bravo", "2"] }]);
        expect(visibleRows(data, "", 1, false).map((row) => row.index)).toEqual([2, 1, 0]);
        expect(visibleRows(data, "", 1, true).map((row) => row.index)).toEqual([0, 1, 2]);
        expect(
            parseDataset(
                exportDataset(
                    data,
                    visibleRows(data, "Bravo", -1, false).map((row) => row.values)
                ),
                "filtered.csv"
            ).rows
        ).toEqual([["Bravo", "2"]]);
    });
    test("summarizes only actual numeric cells and preserves negative values", () => {
        const data = parseDataset("Value\n10\n-2\nmissing\nInfinity\n0", "input.csv");
        expect(numericSummary(visibleRows(data, "", -1, false), 0)).toEqual({
            count: 3,
            min: -2,
            max: 10,
            mean: 8 / 3,
        });
        expect(numericSummary(visibleRows(data, "missing", -1, false), 0)).toBeNull();
    });
    test("rejects malformed, ragged, oversized and overlong datasets", () => {
        expect(() => parseDataset("", "input.csv")).toThrow("empty");
        expect(() => parseDataset('Name,Value\n"unterminated,10', "input.csv")).toThrow("parse failed");
        expect(() => parseDataset("A,B\n1", "input.csv")).toThrow("row 2");
        expect(() => parseDataset("a".repeat(DataSizeLimit + 1), "input.csv")).toThrow("2 MB");
        expect(() => parseDataset(`Header\n${"value\n".repeat(DataRowLimit + 1)}`, "input.csv")).toThrow("10,000");
        expect(() => parseDataset(Array.from({ length: 51 }, (_, i) => `Column${i}`).join(","), "input.csv")).toThrow(
            "50 columns"
        );
        expect(() => validateDataset({ filename: "file", headers: ["A"], rows: [[5]] })).toThrow("Invalid");
    });
});
