// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { uploadComposerAttachment } from "@hermes/app/session/hooks/use-prompt-actions";
import { expect, it, vi } from "vitest";
import { deliverQuickEntryImages } from "./quick-entry-image-delivery";

const Payload = {
    target: "current",
    text: "Inspect this frozen screen",
    images: [{ filename: "capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }],
};

it("submits one image occurrence with bytes outside the prompt", async () => {
    const submit = vi.fn(async () => true);
    const restore = vi.fn();
    await deliverQuickEntryImages(Payload, submit, restore);
    expect(submit).toHaveBeenCalledTimes(1);
    const [text, options] = submit.mock.calls[0] as unknown as [string, { attachments: any[] }];
    expect(text).toBe(Payload.text);
    expect(text).not.toContain("base64");
    expect(options.attachments).toHaveLength(1);
    expect(options.attachments[0]).toMatchObject({ kind: "image", imageDataUrl: Payload.images[0].dataUrl });
    expect(restore).not.toHaveBeenCalled();
});

it.each(["declined", "rejected"])("restores captured pixels and draft when send is %s", async (failure) => {
    const submit = vi.fn(async () => {
        if (failure === "rejected") throw new Error("Upload unavailable");
        return false;
    });
    const restore = vi.fn();
    await deliverQuickEntryImages(Payload, submit, restore);
    expect(restore).toHaveBeenCalledExactlyOnceWith(Payload.text, [
        expect.objectContaining({ imageDataUrl: Payload.images[0].dataUrl, path: "capture.png" }),
    ]);
});

it("stages one captured image into the destination session using the real upload path", async () => {
    const requestGateway = vi.fn(async () => ({ attached: true, path: "/destination/capture.png" }));
    const restore = vi.fn();
    await deliverQuickEntryImages(
        Payload,
        async (text, { attachments }) => {
            expect(text).toBe(Payload.text);
            const staged = await uploadComposerAttachment(attachments[0], {
                remote: false,
                sessionId: "destination-session",
                requestGateway: requestGateway as any,
            });
            expect(staged.attachedSessionId).toBe("destination-session");
            expect(staged.imageDataUrl).toBeUndefined();
            return true;
        },
        restore
    );
    expect(requestGateway).toHaveBeenCalledExactlyOnceWith("image.attach_bytes", {
        session_id: "destination-session",
        content_base64: "Y2FwdHVyZQ==",
        filename: "capture.png",
    });
    expect(restore).not.toHaveBeenCalled();
});
