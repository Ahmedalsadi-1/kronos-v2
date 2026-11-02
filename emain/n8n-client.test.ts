// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { n8nRequestUrl, releaseN8nRequests, requestN8n } from "./n8n-client";
const account = vi.hoisted(() => ({ get: vi.fn(async () => "fixture-cookie"), forget: vi.fn() }));
vi.mock("./workflow-account", () => ({
    workflowAccount: account.get,
    forgetWorkflowSession: account.forget,
    WorkflowBrowserId: "fixture-browser",
}));
const origin = "http://127.0.0.1:56789";
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    releaseN8nRequests(origin);
});

it("renews editor and Hermes requests through the same scoped authenticated client", async () => {
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("expired", { status: 401 }))
        .mockResolvedValueOnce(Response.json({ data: { id: "workflow" } }));
    const result = await requestN8n(origin, { route: "/rest/workflows/workflow", pushRef: "fixture-push" });
    expect(result).toMatchObject({ status: 200, data: { data: { id: "workflow" } } });
    expect(account.forget).toHaveBeenCalledWith(origin, "fixture-cookie");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
        redirect: "error",
        headers: { cookie: "fixture-cookie", "browser-id": "fixture-browser", "push-ref": "fixture-push" },
    });
    expect(JSON.stringify(result)).not.toContain("fixture-cookie");
});

it("rejects external, traversal and malformed API routes before transmitting credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (const route of [
        "https://example.com/rest/login",
        "//example.com/rest/login",
        "/rest/../secret",
        "/rest/%2e%2e/secret",
        "/secret",
        "/rest\\login",
        "/rest/login#ignored",
    ]) {
        expect(() => n8nRequestUrl(origin, route)).toThrow("Invalid editor API route");
    }
    expect(fetchMock).not.toHaveBeenCalled();
});

it("preserves raw binary uploads and download content metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(new Uint8Array([2, 3]), {
            headers: {
                "content-type": "application/octet-stream",
                "content-disposition": "attachment; filename=fixture.bin",
                "set-cookie": "secret",
            },
        })
    );
    const result = await requestN8n(origin, {
        route: "/rest/binary-data",
        method: "POST",
        encoding: "bytes",
        body: [0, 255],
        contentType: "application/octet-stream",
        responseType: "arraybuffer",
    });
    expect(fetchMock.mock.calls[0][1].body).toEqual(new Uint8Array([0, 255]).buffer);
    expect(result).toMatchObject({
        bytes: [2, 3],
        headers: {
            "content-type": "application/octet-stream",
            "content-disposition": "attachment; filename=fixture.bin",
        },
    });
    expect(result.headers).not.toHaveProperty("set-cookie");
});

it("rejects oversized streams while reading rather than after buffering", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(32 * 1024 * 1024));
            controller.enqueue(new Uint8Array(1));
        },
        cancel,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
    await expect(requestN8n(origin, { route: "/rest/executions" })).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledOnce();
});

it("aborts live requests when their runtime is stopped", async () => {
    let started: () => void;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
        async (_url, options) =>
            new Promise((_resolve, reject) => {
                options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
                started();
            })
    );
    const pending = requestN8n(origin, { route: "/rest/executions" });
    await ready;
    releaseN8nRequests(origin);
    await expect(pending).rejects.toThrow();
});
