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
