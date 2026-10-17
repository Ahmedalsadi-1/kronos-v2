// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { type Report } from "./report";

export function ReportPreview({ report }: { report: Report }) {
    return (
        <article className="max-w-none space-y-3 text-inherit [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-medium [&_h3]:font-medium [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
            <h1>{report.title}</h1>
            <ReactMarkdown
                skipHtml
                components={{
                    img: ({ alt }) => <span>[Image: {alt || "untitled"}]</span>,
                    a: ({ href, children }) => (
                        <a className="cursor-pointer underline" href={href} target="_blank" rel="noreferrer">
                            {children}
                        </a>
                    ),
                }}
            >
                {report.body}
            </ReactMarkdown>
            {report.sources.length > 0 && (
                <section className="space-y-3">
                    <h2>Sources</h2>
                    {report.sources.map((source) => (
                        <div key={source.id}>
                            <h3>
                                [{source.number}] {source.title}
                            </h3>
                            <a
                                className="cursor-pointer break-all underline"
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {source.url}
                            </a>
                            <blockquote className="mt-2 whitespace-pre-wrap">{source.excerpt}</blockquote>
                        </div>
                    ))}
                </section>
            )}
        </article>
    );
}

export function reportHtml(report: Report): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Report</title><style>body{max-width:850px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:16px}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style></head><body>${renderToStaticMarkup(<ReportPreview report={report} />)}</body></html>`;
}
