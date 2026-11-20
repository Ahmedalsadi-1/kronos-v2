// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import { uploadComposerAttachment } from "./index";

it("stages captured pixels through image.attach_bytes even for a local gateway", async () => {
    const requestGateway = vi.fn(async () => ({ attached: true, path: "/session/capture.png" }));
    const result = await uploadComposerAttachment(
        {
            id: "capture",
            kind: "image",
            label: "capture.png",
            path: "capture.png",
            imageDataUrl: "data:image/png;base64,Y2FwdHVyZQ==",
        },
        { remote: false, sessionId: "session", requestGateway: requestGateway as any }
    );
    expect(requestGateway).toHaveBeenCalledExactlyOnceWith("image.attach_bytes", {
        session_id: "session",
        content_base64: "Y2FwdHVyZQ==",
        filename: "capture.png",
    });
    expect(result.path).toBe("/session/capture.png");
    expect(result.imageDataUrl).toBeUndefined();
});

it("stages browser text/PDF bytes with file.attach for the exact target session", async () => {
    const requestGateway = vi.fn(async () => ({ attached: true, path: "/session/notes.md", ref_text: "[Attached: notes.md]" }));
    const result = await uploadComposerAttachment(
        { id: "pen-file", kind: "file", label: "notes.md", path: "notes.md", fileDataUrl: "data:text/plain;base64,aGVsbG8=" },
        { remote: false, sessionId: "pen-session", requestGateway: requestGateway as any }
    );
    expect(requestGateway).toHaveBeenCalledExactlyOnceWith("file.attach", {
        name: "notes.md", path: "", session_id: "pen-session", data_url: "data:text/plain;base64,aGVsbG8=",
    });
    expect(result.attachedSessionId).toBe("pen-session");
    expect(result.refText).toBe("[Attached: notes.md]");
    expect(result.path).toBe("/session/notes.md");
    expect(result.fileDataUrl).toBeUndefined();
});

it("propagates attachment rejection instead of sending a prompt without the file", async () => {
    const requestGateway = vi.fn(async () => ({ attached: false, message: "PDF extraction failed" }));
    await expect(uploadComposerAttachment(
        { id: "pdf", kind: "file", label: "paper.pdf", path: "paper.pdf", fileDataUrl: "data:application/pdf;base64,JVBERg==" },
        { remote: true, sessionId: "remote-session", requestGateway: requestGateway as any }
    )).rejects.toThrow("PDF extraction failed");
});
