// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { emptyReport, makeSource } from "./report";
import { reportHtml } from "./report-render";

test("HTML exports format reports and citations while excluding executable markup and remote images", () => {
    const html = reportHtml({
        ...emptyReport(),
        title: "Report",
        body: "## Finding\n\n**Evidence** [attack](javascript:alert(1))\n\n<script>alert('bad')</script>\n\n![Image](https://example.com/track.png)",
        sources: [makeSource("Source", "https://example.com/report", "<script>citation</script>")],
        nextSourceNumber: 2,
    });
    expect(html).toContain("<h2>Finding</h2>");
    expect(html).toContain("<strong>Evidence</strong>");
    expect(html).toContain('href="https://example.com/report"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;citation&lt;/script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
});
