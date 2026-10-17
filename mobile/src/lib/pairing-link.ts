export interface PairingLink {
    baseUrl: string;
    expiresAt: number;
}
export function parsePairingLink(value: string, now = Date.now()): PairingLink | null {
    try {
        const link = new URL(value);
        if (link.protocol !== "kronterm:" || link.hostname !== "pair" || (link.pathname && link.pathname !== "/"))
            return null;
        const host = new URL(link.searchParams.get("host") ?? "");
        const expiresAt = Number(link.searchParams.get("expires"));
        if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 15 * 60_000) return null;
        if (
            !["http:", "https:"].includes(host.protocol) ||
            host.username ||
            host.password ||
            host.search ||
            host.hash ||
            host.pathname !== "/"
        )
            return null;
        const octets = host.hostname.split(".").map(Number);
        const privateIP =
            octets.length === 4 &&
            octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
            (octets[0] === 10 ||
                (octets[0] === 192 && octets[1] === 168) ||
                (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
        if (host.protocol === "http:" && !privateIP && !/^[a-z0-9-]+\.local$/i.test(host.hostname)) return null;
        return { baseUrl: host.origin, expiresAt };
    } catch {
        return null;
    }
}
