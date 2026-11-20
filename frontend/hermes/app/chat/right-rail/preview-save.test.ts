import { describe, expect, it, vi } from "vitest";

import { savePreviewDraft } from "./preview-save";

describe("preview draft save", () => {
    it("keeps the draft and never writes when the baseline cannot be reread", async () => {
        const write = vi.fn();
        const options = {
            baseline: "original",
            draft: "unsaved edit",
            read: vi.fn().mockRejectedValue(new Error("File unavailable")),
            write,
        };
        await expect(savePreviewDraft(options)).rejects.toThrow("File unavailable");
        expect(write).not.toHaveBeenCalled();
        expect(options.draft).toBe("unsaved edit");
    });

    it.each([{ binary: true, text: "original" }, {}])("refuses unverifiable text %j", async (current) => {
        const write = vi.fn();
        await expect(
            savePreviewDraft({ baseline: "original", draft: "edit", read: async () => current, write })
        ).rejects.toThrow();
        expect(write).not.toHaveBeenCalled();
    });

    it("preserves external edits until the user explicitly chooses overwrite", async () => {
        const write = vi.fn();
        const read = vi.fn().mockResolvedValue({ text: "external edit" });
        const options = { baseline: "original", draft: "my draft", read, write };
        expect(await savePreviewDraft(options)).toBe("conflict");
        expect(write).not.toHaveBeenCalled();
        expect(await savePreviewDraft({ ...options, force: true })).toBe("saved");
        expect(write).toHaveBeenCalledExactlyOnceWith("my draft");
        expect(read).toHaveBeenCalledOnce();
    });

    it.each(["original", ""])("saves a verified baseline including empty files", async (baseline) => {
        const write = vi.fn();
        expect(await savePreviewDraft({ baseline, draft: "edit", read: async () => ({ text: baseline }), write })).toBe(
            "saved"
        );
        expect(write).toHaveBeenCalledExactlyOnceWith("edit");
    });

    it("propagates write failures so the editor retains its dirty draft", async () => {
        await expect(
            savePreviewDraft({
                baseline: "original",
                draft: "edit",
                read: async () => ({ text: "original" }),
                write: async () => {
                    throw new Error("Disk full");
                },
            })
        ).rejects.toThrow("Disk full");
    });
});
