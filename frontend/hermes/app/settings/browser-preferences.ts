// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
export type BrowserPreferences = {
    "web:defaulturl": string;
    "web:defaultsearch": string;
    "web:openlinksinternally": boolean;
};
export function validateBrowserPreferences(value: BrowserPreferences): string {
    for (const [label, input] of [
        ["Start page", value["web:defaulturl"]],
        ["Search URL", value["web:defaultsearch"]],
    ]) {
        if (label === "Start page" && input === "about:blank") continue;
        try {
            const url = new URL(input);
            if (!["http:", "https:"].includes(url.protocol)) return `${label} must use http or https.`;
        } catch {
            return `${label} must be a complete URL.`;
        }
    }
    if (!value["web:defaultsearch"].includes("{query}"))
        return "Include {query} in the search URL where your search terms should go.";
    return "";
}
