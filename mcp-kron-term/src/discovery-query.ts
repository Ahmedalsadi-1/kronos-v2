const QueryNoise = new Set([
    "a",
    "an",
    "the",
    "to",
    "for",
    "with",
    "and",
    "tools",
    "tool",
    "please",
    "find",
    "show",
    "me",
    "how",
    "can",
    "i",
    "use",
]);
const QueryWords: Record<string, string> = {
    files: "file",
    widgets: "widget",
    skills: "skill",
    workflows: "workflow",
    agents: "agent",
    terminals: "terminal",
    browsers: "browser",
    screenshots: "screenshot",
    directories: "directory",
};

export function discoveryWords(value: string, query = false): string[] {
    return [
        ...new Set(
            value
                .toLowerCase()
                .split(/[^\p{L}\p{N}]+/u)
                .filter(Boolean)
                .filter((word) => !query || !QueryNoise.has(word))
                .map((word) => QueryWords[word] ?? word)
        ),
    ];
}

export function matchesDiscoveryQuery(text: string, terms: string[]): boolean {
    const words = discoveryWords(text);
    return terms.every((term) => words.some((word) => word.includes(term)));
}
