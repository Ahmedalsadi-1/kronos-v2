// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { forgetWorkflowSession, workflowAccount, WorkflowBrowserId } from "./workflow-account";

const PayloadLimit = 32 * 1024 * 1024;
const ActiveRequests = new Map<string, Set<AbortController>>();
export type N8nEditorRequest = {
    route: string;
    method?: string;
    body?: unknown;
    encoding?: "bytes" | "text" | "json";
    contentType?: string;
    responseType?: string;
    pushRef?: string;
    requestId?: string;
    form?: { name: string; value: string | number[]; filename?: string; type?: string }[];
};

function bytes(value: unknown): Uint8Array {
    if (
        !Array.isArray(value) ||
        value.length > PayloadLimit ||
        value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
    )
        throw new Error("Invalid workflow upload bytes.");
    return new Uint8Array(value);
}

export function n8nRequestUrl(origin: string, route: string): URL {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//") || /[\\\\#\r\n]/.test(route))
        throw new Error("Invalid editor API route.");
    const url = new URL(route, origin);
    const pathname = decodeURIComponent(url.pathname);
    if (
        url.origin !== new URL(origin).origin ||
        !/^\/(rest|types|icons|healthz)(\/|$)/.test(pathname) ||
        route.split("?")[0].includes("..") ||
        pathname.split("/").some((part) => part === "." || part === "..")
    )
        throw new Error("Invalid editor API route.");
    return url;
}

function requestBody(input: N8nEditorRequest): { body?: BodyInit; contentType?: string } {
    if (input.form) {
        if (!Array.isArray(input.form)) throw new Error("Invalid workflow upload.");
        const form = new FormData();
        let size = 0;
        for (const field of input.form) {
            if (typeof field.name !== "string" || (typeof field.value !== "string" && !Array.isArray(field.value)))
                throw new Error("Invalid workflow upload field.");
            const value = typeof field.value === "string" ? field.value : bytes(field.value);
            size += typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
            if (size > PayloadLimit) throw new Error("Workflow upload exceeds the size limit.");
            if (typeof value === "string") form.append(field.name, value);
            else
                form.append(field.name, new Blob([new Uint8Array(value).buffer], { type: field.type }), field.filename);
        }
        return { body: form };
    }
    if (input.body == null) return {};
    if (input.contentType && (input.contentType.length > 256 || /[\r\n]/.test(input.contentType)))
        throw new Error("Invalid upload content type.");
    if (input.encoding === "bytes")
        return {
            body: new Uint8Array(bytes(input.body)).buffer,
            contentType: input.contentType || "application/octet-stream",
        };
    const body = input.encoding === "text" ? String(input.body) : JSON.stringify(input.body);
    if (Buffer.byteLength(body) > PayloadLimit) throw new Error("Workflow upload exceeds the size limit.");
    return { body, contentType: input.contentType || (input.encoding === "text" ? "text/plain" : "application/json") };
}

async function boundedResponse(response: Response): Promise<Uint8Array> {
    if (Number(response.headers.get("content-length")) > PayloadLimit)
        throw new Error("Workflow response exceeds the size limit.");
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > PayloadLimit) {
                await reader.cancel();
                throw new Error("Workflow response exceeds the size limit.");
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, length);
}

async function performN8nRequest(origin: string, input: N8nEditorRequest, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const url = n8nRequestUrl(origin, input.route);
    const method = input.method || "GET";
    if (!["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"].includes(method))
        throw new Error("Unsupported editor method.");
    const payload = requestBody(input);
    if (["GET", "HEAD"].includes(method) && payload.body != null)
        throw new Error("Read requests cannot include a body.");
    let response: Response;
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    for (let attempt = 0; attempt < 2; attempt++) {
        const cookie = await workflowAccount(origin);
        requestSignal.throwIfAborted();
        response = await fetch(url, {
            method,
            redirect: "error",
            headers: {
                cookie,
                "browser-id": WorkflowBrowserId,
                ...(payload.contentType ? { "content-type": payload.contentType } : {}),
                ...(typeof input.pushRef === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(input.pushRef)
                    ? { "push-ref": input.pushRef }
                    : {}),
            },
            body: payload.body,
            signal: requestSignal,
        });
        if (response.status !== 401) break;
        await response.body?.cancel();
        forgetWorkflowSession(origin, cookie);
    }
    if (response.status === 401) throw new Error("Reconnect your KronTerm account in the Workflows panel.");
    const body = await boundedResponse(response);
    const headers = Object.fromEntries(
        ["content-type", "content-disposition", "etag", "retry-after"]
            .map((key) => [key, response.headers.get(key)])
            .filter(([, value]) => value != null)
    );
    if (["blob", "arraybuffer"].includes(input.responseType))
        return { status: response.status, statusText: response.statusText, bytes: Array.from(body), headers };
    const text = new TextDecoder().decode(body);
    let data: unknown = text;
    try {
        data = JSON.parse(text);
    } catch {}
    return { status: response.status, statusText: response.statusText, data, headers };
}

export function releaseN8nRequests(origin: string) {
    const key = new URL(origin).origin;
    for (const controller of ActiveRequests.get(key) ?? []) controller.abort();
    ActiveRequests.delete(key);
}
export async function requestN8n(origin: string, input: N8nEditorRequest, signal?: AbortSignal) {
    const key = new URL(origin).origin;
    const active = ActiveRequests.get(key) ?? new Set<AbortController>();
    const controller = new AbortController();
    active.add(controller);
    ActiveRequests.set(key, active);
    try {
        return await performN8nRequest(
            origin,
            input,
            signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
        );
    } finally {
        active.delete(controller);
        if (!active.size && ActiveRequests.get(key) === active) ActiveRequests.delete(key);
    }
}
