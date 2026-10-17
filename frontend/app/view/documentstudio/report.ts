// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const ReportSizeLimit = 256 * 1024;
export type ReportSource = { id: string; number: number; title: string; url: string; excerpt: string };
export type Report = {
    title: string;
    body: string;
    sources: ReportSource[];
    nextSourceNumber: number;
    revision: number;
    updatedAt: string;
};

export function emptyReport(): Report {
    return { title: "Untitled report", body: "", sources: [], nextSourceNumber: 1, revision: 0, updatedAt: "" };
}

export function makeSource(title: string, url: string, excerpt: string, number = 1): ReportSource {
    if (!Number.isInteger(number) || number < 1) throw new Error("Invalid source number");
    if (!title.trim() || title.length > 300) throw new Error("A source title of at most 300 characters is required");
    const source = new URL(url);
    if (!["http:", "https:"].includes(source.protocol)) throw new Error("Source links must use HTTP or HTTPS");
    source.username = "";
    source.password = "";
    if (excerpt.length > 8000) throw new Error("Source excerpts must be at most 8,000 characters");
    return { id: crypto.randomUUID(), number, title: title.trim(), url: source.toString(), excerpt: excerpt.trim() };
}

export function validateReport(value: unknown): Report {
    const report = value as Report;
    if (
        !report ||
        typeof report.title !== "string" ||
        !report.title.trim() ||
        report.title.length > 300 ||
        typeof report.body !== "string" ||
        typeof report.updatedAt !== "string" ||
        !Number.isInteger(report.revision) ||
        report.revision < 0 ||
        !Array.isArray(report.sources) ||
        report.sources.length > 50
    )
        throw new Error("Invalid saved report");
    if (new TextEncoder().encode(JSON.stringify(report)).length > ReportSizeLimit)
        throw new Error("Report must be at most 256 KB including sources");
    const ids = new Set<string>();
    const numbers = new Set<number>();
    const sources = report.sources.map((source) => {
        if (
            !source ||
            typeof source.id !== "string" ||
            !source.id ||
            ids.has(source.id) ||
            typeof source.title !== "string" ||
            typeof source.url !== "string" ||
            typeof source.excerpt !== "string"
        )
            throw new Error("Invalid report source");
        if (numbers.has(source.number)) throw new Error("Duplicate source number");
        const sanitized = makeSource(source.title, source.url, source.excerpt, source.number);
        ids.add(source.id);
        numbers.add(source.number);
        return { ...source, url: sanitized.url };
    });
    if (
        !Number.isInteger(report.nextSourceNumber) ||
        report.nextSourceNumber <= Math.max(0, ...sources.map((source) => source.number))
    )
        throw new Error("Invalid next source number");
    return { ...report, sources };
}

export function reportMarkdown(report: Report): string {
    return [
        `# ${report.title.replace(/[\r\n]/g, " ")}`,
        report.body,
        report.sources.length ? "## Sources" : "",
        ...report.sources.map((source) =>
            [
                `### [${source.number}] ${source.title.replace(/[\r\n]/g, " ")}`,
                `Source: <${source.url}>`,
                source.excerpt
                    .split("\n")
                    .map((line) => `> ${line}`)
                    .join("\n"),
            ]
                .filter(Boolean)
                .join("\n\n")
        ),
    ]
        .filter(Boolean)
        .join("\n\n");
}

export class ReportStore {
    constructor(
        private storage: Pick<Storage, "getItem" | "setItem">,
        private key: string
    ) {}
    load(): Report {
        const saved = this.storage.getItem(this.key);
        return saved ? validateReport(JSON.parse(saved)) : emptyReport();
    }
    save(report: Report, expectedRevision: number): Report {
        const saved = this.load();
        if (saved.revision !== expectedRevision)
            throw new Error("Report changed in another view. Reload the saved report before editing again.");
        const next = validateReport({ ...report, revision: saved.revision + 1, updatedAt: new Date().toISOString() });
        this.storage.setItem(this.key, JSON.stringify(next));
        return next;
    }
}
