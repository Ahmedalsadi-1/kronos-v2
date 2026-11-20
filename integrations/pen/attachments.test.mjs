// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("the embedded editor forwards attachment bytes and conversation ownership to its host", async () => {
    const source = await readFile(new URL("./editor-host.js", import.meta.url), "utf8");
    const start = source.indexOf("frame.contentWindow.__kronosSubmitAgent =");
    const end = source.indexOf("frame.contentWindow.__kronosStopAgent =", start);
    assert.ok(start >= 0 && end > start);
    const frame = { contentWindow: {}, contentDocument: { querySelectorAll: () => [] } };
    const messages = [];
    const agentReplies = new Map();
    runInNewContext(source.slice(start, end), {
        frame, crypto: { randomUUID: () => "request" }, agentReplies,
        imageReviews: new Map(), shell: { setAgentWorkers() {} }, emit: (message) => messages.push(message),
    });
    const files = [{ type: "text", name: "notes.txt", content: "hello" }];
    const reply = () => {};
    frame.contentWindow.__kronosSubmitAgent({ prompt: "Read", conversationId: "hermes:stored", files }, reply);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].files, files);
    assert.equal(messages[0].hermesSessionId, "stored");
    assert.equal(messages[0].requestId, "request");
    assert.equal(agentReplies.get("request").reply, reply);
});

test("browser selections append native attachments and draft text without sending a turn", async () => {
    const source = await readFile(new URL("./editor-host.js", import.meta.url), "utf8");
    const start = source.indexOf('case "stage_chat_selection":');
    const end = source.indexOf('case "stage_image_review":', start);
    assert.ok(start >= 0 && end > start);
    const files = [];
    const drafts = [];
    const slot = { isConnected: true, getClientRects: () => [1], kronosControls: {
        addFiles: async next => files.push(...next), insert: text => drafts.push(text),
    }};
    const context = {
        frame: { contentDocument: { querySelectorAll: () => [slot] }, contentWindow: { File } },
        fetch: async () => ({ blob: async () => new Blob(["pixels"], { type: "image/png" }) }),
    };
    const stage = runInNewContext(`(async params => {let result;switch("stage_chat_selection"){${source.slice(start, end)}}return result;})`, context);
    const selection = { text: "Selected text at x=10, y=20", images: [{ filename: "selection.png", dataUrl: "data:image/png;base64,eA==" }] };
    await stage(selection);
    await stage(selection);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, "selection.png");
    assert.equal(files[0].type, "image/png");
    assert.deepEqual(drafts, ["\n\n" + selection.text, "\n\n" + selection.text]);
});
