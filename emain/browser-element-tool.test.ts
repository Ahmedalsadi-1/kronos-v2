// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { installBrowserElementTool } from "./browser-element-tool";

function guest(type = "webview", url = "https://example.com") {
    return {
        isDestroyed: vi.fn(() => false),
        getType: () => type,
        getURL: () => url,
        insertCSS: vi.fn(async () => "style"),
        executeJavaScript: vi.fn(async (_script: string) => undefined),
    };
}

describe("browser element tool ownership", () => {
    it("installs in the page guest, never in the Electron application renderer", async () => {
        const browser = guest();
        const application = guest("window");
        await installBrowserElementTool(browser as unknown as WebContents);
        await installBrowserElementTool(application as unknown as WebContents);
        expect(browser.executeJavaScript).toHaveBeenCalledOnce();
        expect(application.executeJavaScript).not.toHaveBeenCalled();
    });

    it("does not run after a guest closes during stylesheet insertion", async () => {
        const browser = guest();
        browser.insertCSS.mockImplementation(async () => {
            browser.isDestroyed.mockReturnValue(true);
            return "style";
        });
        await installBrowserElementTool(browser as unknown as WebContents);
        expect(browser.executeJavaScript).not.toHaveBeenCalled();
    });

    it("leaves internal and uninitialized guest pages alone", async () => {
        const browser = guest("webview", "about:blank");
        await installBrowserElementTool(browser as unknown as WebContents);
        expect(browser.insertCSS).not.toHaveBeenCalled();
    });
});
