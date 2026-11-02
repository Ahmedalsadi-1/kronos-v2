// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

async function nativeRequest(payload, timeoutMs = 185000) {
    const url = process.env.KRONTERM_N8N_TOOL_URL;
    const token = process.env.KRONTERM_N8N_TOOL_TOKEN;
    if (!url || !token) throw new Error("Start n8n from KronTerm to attach workspace tools.");
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/native") {
        throw new Error("Invalid KronTerm tool endpoint.");
    }
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const result = await response.json();
    if (!response.ok || result.isError) {
        throw new Error(
            result.error ||
                result.content?.map((entry) => entry.text || "").join("\n") ||
                `KronTerm tool failed (${response.status}).`
        );
    }
    return result;
}

function objectParameter(value) {
    const result = typeof value === "string" ? JSON.parse(value) : value;
    if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("Arguments must be a JSON object.");
    return result;
}

exports.callTool = callTool;
exports.objectParameter = objectParameter;

function callTool(name, args, timeoutMs) {
    return nativeRequest({ method: "call", name, arguments: args }, timeoutMs);
}

exports.listTools = () => nativeRequest({ method: "list" });

exports.toolOutput = (result) => {
    const text = result.content?.filter((entry) => entry.type === "text").map((entry) => entry.text || "").join("\n") || "";
    let output = {};
    try {
        const value = JSON.parse(text);
        if (value && typeof value === "object" && !Array.isArray(value)) output = value;
    } catch {
        output = {};
    }
    const blockId = text.match(/\b[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\b/i)?.[0];
    return { ...output, output: output.text || text, ...(blockId ? { blockId } : {}) };
};
