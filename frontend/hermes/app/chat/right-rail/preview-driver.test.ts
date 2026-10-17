import { afterEach, describe, expect, it, vi } from "vitest";

import { selectRightRailTab } from "@hermes/store/layout";
import { $previewTabs } from "@hermes/store/preview";
import { actOnActivePreview, registerPreviewDriver } from "./preview-driver";

afterEach(() => {
    $previewTabs.set([]);
    selectRightRailTab(null);
});

describe("built-in Kronos browser driver", () => {
    it("routes history actions to the active browser", async () => {
        $previewTabs.set([
            {
                id: "url:browser",
                target: { kind: "url", label: "Browser", source: "manual", url: "https://example.com" },
            },
        ]);
        selectRightRailTab("url:browser");
        const back = vi.fn();
        const dispose = registerPreviewDriver("url:browser", {
            back,
            execute: vi.fn(),
            forward: vi.fn(),
            reload: vi.fn(),
        });

        await expect(actOnActivePreview({ kind: "back" })).resolves.toEqual({ acted: "back", success: true });
        expect(back).toHaveBeenCalledOnce();
        dispose();
    });

    it("returns an explicit error when no built-in browser is open", async () => {
        await expect(actOnActivePreview({ kind: "elements" })).resolves.toEqual({
            error: "No live page is open in the built-in KronTerm Agent browser.",
            success: false,
        });
    });
});
