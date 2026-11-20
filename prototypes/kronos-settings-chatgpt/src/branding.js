// Copyright 2026, KronOS.
const Replacements = [
    [/kronoscode/gi, "KronAgent"],
    [/hermes/gi, "KronAgent"],
    [/comfyui|\bcomfy\b/gi, "KronRender"],
    [/litegraph/gi, "KronGraph"],
    [/pen\.dev|pen canvas/gi, "KronCanvas"],
    [/\bn8n\b/gi, "KronFlow"],
    [/waveai/gi, "KronAgent"],
    [/waveterm|wave terminal/gi, "KronOS"],
    [/\bwave\b/gi, "KronOS"],
    [/petdex/gi, "KronPets"],
    [/tsunami/gi, "KronBuilder"],
    [/electron/gi, "KronDesktop"],
    [/VS Code|VSCode/gi, "KronThemes"],
];
export function brandText(value) {
    if (typeof value !== "string") return value;
    return Replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}
export function brandValue(value) {
    if (Array.isArray(value)) return value.map(brandValue);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [brandText(key), brandValue(item)]));
    return brandText(value);
}
const SourceNames = {
    Hermes: "Agent",
    Desktop: "Desktop",
    Environment: "Environment",
    Canvas: "KronCanvas",
    "Agent interface": "Desktop controls",
};
export function sourceName(value) {
    return SourceNames[value] || brandText(value);
}
export function publicKey(row) {
    const source =
        {
            Hermes: "agent",
            Desktop: "os",
            KronRender: "render",
            KronFlow: "flow",
            Environment: "connect",
            Canvas: "canvas",
            "Agent interface": "interface",
        }[row.source] || "settings";
    return `kron.${source}.${brandText(row.key.replace(/^Comfy\./i, "")).replace(/:/g, ".")}`;
}
