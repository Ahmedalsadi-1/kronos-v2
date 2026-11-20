// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { MaxImportedBookmarks, normalizeMigrationBookmark, type MigrationBookmark } from "@/types/browser-migration";

export function readBookmarkExport(text: string, markdown: boolean): MigrationBookmark[] {
    const bookmarks = new Map<string, MigrationBookmark>();
    const add = (url: string, title: string) => {
        const bookmark = normalizeMigrationBookmark(url, title);
        if (bookmark && !bookmarks.has(bookmark.url)) {
            if (bookmarks.size >= MaxImportedBookmarks) throw new Error("Import up to 10,000 bookmarks at a time.");
            bookmarks.set(bookmark.url, bookmark);
        }
    };
    if (markdown) {
        for (const line of text.split(/\r?\n/)) {
            const markdownLink = /\[([^\]\n]*)\]\((<https?:\/\/[^>]+>|https?:\/\/(?:[^\s()]|\([^()\n]*\))+)\)/gi;
            for (const match of line.matchAll(markdownLink)) {
                add(match[2].replace(/^<|>$/g, ""), match[1]);
            }
            const bareLink = /^\s*(?:[-*+]\s+)?<?(https?:\/\/[^\s<>]+)>?\s*$/i.exec(line);
            if (bareLink) add(bareLink[1], "");
        }
    } else {
        // Template contents stay inert, including images and other subresources in exports.
        const template = document.createElement("template");
        template.innerHTML = text;
        for (const link of template.content.querySelectorAll("a[href]")) {
            add(link.getAttribute("href"), link.textContent);
        }
    }
    return [...bookmarks.values()];
}
