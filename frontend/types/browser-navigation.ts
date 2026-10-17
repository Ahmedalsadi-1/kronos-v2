export type BrowserNavigationSnapshot = {
    entries: { url: string; title: string }[];
    index: number;
};

export function browserNavigationSnapshot(value: unknown): BrowserNavigationSnapshot | null {
    const snapshot = value as BrowserNavigationSnapshot;
    if (
        !Array.isArray(snapshot?.entries) ||
        snapshot.entries.length === 0 ||
        snapshot.entries.length > 60 ||
        !Number.isInteger(snapshot.index) ||
        snapshot.index < 0 ||
        snapshot.index >= snapshot.entries.length
    )
        return null;
    const entries: BrowserNavigationSnapshot["entries"] = [];
    for (const entry of snapshot.entries) {
        if (typeof entry?.url !== "string" || entry.url.length > 4096 || typeof entry.title !== "string") return null;
        try {
            const url = new URL(entry.url);
            if (url.protocol !== "http:" && url.protocol !== "https:") return null;
            url.username = "";
            url.password = "";
            for (const key of [...url.searchParams.keys()]) {
                if (/token|secret|password|api.?key|oauth|session|csrf|signature/i.test(key))
                    url.searchParams.delete(key);
            }
            if (/token|secret|password|api.?key|oauth|session|csrf/i.test(url.hash)) url.hash = "";
            entries.push({ url: url.href, title: entry.title.slice(0, 300) });
        } catch {
            return null;
        }
    }
    return { entries, index: snapshot.index };
}
