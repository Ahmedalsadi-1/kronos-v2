// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { readBookmarkExport } from "./browser-bookmark-import";

describe("browser bookmarks import", () => {
    it("reads HTML exports without keeping duplicate, executable, or credential-bearing links", () => {
        expect(
            readBookmarkExport(
                `
            <DL><DT><A HREF="https://example.com">Example &amp; Co</A>
            <DT><A HREF="https://example.com/">Duplicate</A>
            <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
            <DT><A HREF="https://user:pass@example.com/private">Credential</A>
            <DT><A HREF="file:///home/file">Local file</A></DL>
        `,
                false
            )
        ).toEqual([{ url: "https://example.com/", title: "Example & Co" }]);
    });

    it("reads titled Arc sidebar links and plain URL lists", () => {
        expect(
            readBookmarkExport(
                `
# Design
- [Pinned docs](https://example.com/Docs_(web))
  - [Reference](<https://example.com/with%20spaces>)
* https://example.org/
        `,
                true
            )
        ).toEqual([
            { url: "https://example.com/Docs_(web)", title: "Pinned docs" },
            { url: "https://example.com/with%20spaces", title: "Reference" },
            { url: "https://example.org/", title: "" },
        ]);
    });
});
