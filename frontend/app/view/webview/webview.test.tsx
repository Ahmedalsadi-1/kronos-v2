// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { makeMockWaveEnv } from "@/preview/mock/mockwaveenv";
import type { WebviewTag } from "electron";
import { atom } from "jotai";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
    getWebPreviewDisplayUrl,
    isWebviewReadyForElectronCall,
    WebViewModel,
    WebViewPreviewFallback,
} from "./webview";

describe("webview preview fallback", () => {
    it("preserves address editing when the workspace requests browser focus", () => {
        const model = new WebViewModel({
            blockId: "address-focus",
            nodeModel: { isFocused: atom(true), focusNode: () => {} } as any,
            tabModel: {} as any,
            waveEnv: makeMockWaveEnv({}),
        });
        const guestFocus = vi.fn();
        model.webviewRef.current = { focus: guestFocus } as unknown as WebviewTag;
        const staleInput = { focus: vi.fn() } as unknown as HTMLInputElement;
        const clickedInput = { select: vi.fn() } as unknown as HTMLInputElement;
        model.urlInputRef.current = staleInput;

        model.handleFocus({ currentTarget: clickedInput } as React.FocusEvent<HTMLInputElement>);
        expect(model.urlInputRef.current).toBe(clickedInput);
        expect(clickedInput.select).toHaveBeenCalledOnce();
        expect(staleInput.focus).not.toHaveBeenCalled();
        expect(model.giveFocus()).toBe(true);
        expect(guestFocus).not.toHaveBeenCalled();

        model.handleUrlChange({ target: { value: "https://next.example" } } as React.ChangeEvent<HTMLInputElement>);
        expect(globalStore.get(model.url)).toBe("https://next.example");
        model.handleNavigate("https://background-navigation.example");
        expect(globalStore.get(model.url)).toBe("https://next.example");
        model.handleBlur({} as React.FocusEvent<HTMLInputElement>);
        model.giveFocus();
        expect(guestFocus).toHaveBeenCalledOnce();
    });
    it("shows the requested URL", () => {
        const markup = renderToStaticMarkup(<WebViewPreviewFallback url="https://kronterm.dev/docs" />);

        expect(markup).toContain("electron webview unavailable");
        expect(markup).toContain("https://kronterm.dev/docs");
    });

    it("falls back to about:blank when no URL is available", () => {
        expect(getWebPreviewDisplayUrl("")).toBe("about:blank");
        expect(getWebPreviewDisplayUrl(null)).toBe("about:blank");
    });

    it("rejects stale or detached webviews during presentation remounts", () => {
        const attached = { isConnected: true } as WebviewTag;
        const replacement = { isConnected: true } as WebviewTag;
        const detached = { isConnected: false } as WebviewTag;

        expect(isWebviewReadyForElectronCall(attached, attached, true)).toBe(true);
        expect(isWebviewReadyForElectronCall(replacement, attached, true)).toBe(false);
        expect(isWebviewReadyForElectronCall(detached, detached, true)).toBe(false);
        expect(isWebviewReadyForElectronCall(attached, attached, false)).toBe(false);
    });

    it("uses the supplied env for homepage atoms and config updates", async () => {
        const blockId = "webview-env-block";
        const env = makeMockWaveEnv({
            settings: {
                "web:defaulturl": "https://default.example",
            },
            mockWaveObjs: {
                [`block:${blockId}`]: {
                    otype: "block",
                    oid: blockId,
                    version: 1,
                    meta: {
                        pinnedurl: "https://block.example",
                    },
                } as Block,
            },
        });
        const model = new WebViewModel({
            blockId,
            nodeModel: {
                isFocused: atom(true),
                focusNode: () => {},
            } as any,
            tabModel: {} as any,
            waveEnv: env,
        });

        expect(globalStore.get(model.homepageUrl)).toBe("https://block.example");

        await model.setHomepageUrl("https://global.example", "global");

        expect(globalStore.get(model.homepageUrl)).toBe("https://global.example");
        expect(globalStore.get(env.getSettingsKeyAtom("web:defaulturl"))).toBe("https://global.example");
        expect(globalStore.get(env.wos.getWaveObjectAtom<Block>(`block:${blockId}`))?.meta?.pinnedurl).toBeUndefined();
    });

    it("keeps widget actions out of the browser navigation controls", () => {
        const blockId = "webview-header-block";
        const env = makeMockWaveEnv({
            settings: {
                "web:defaulturl": "https://kronterm.dev",
            },
            mockWaveObjs: {
                [`block:${blockId}`]: {
                    otype: "block",
                    oid: blockId,
                    version: 1,
                    meta: {},
                } as Block,
            },
        });
        const model = new WebViewModel({
            blockId,
            nodeModel: {
                blockId,
                isFocused: atom(true),
                isMagnified: atom(false),
                isFolded: atom(false),
                focusNode: () => {},
                toggleMagnify: () => {},
                toggleFold: () => {},
                onClose: () => {},
            },
            tabModel: {} as any,
            waveEnv: env,
        });

        const header = globalStore.get(model.viewText) as HeaderElem[];
        const topLevelIcons = header
            .filter((element): element is IconButtonDecl => element.elemtype === "iconbutton")
            .map((element) => element.icon);

        expect(topLevelIcons).not.toContain("expand");
        expect(topLevelIcons).not.toContain("compress");
        expect(topLevelIcons).not.toContain("sliders");
    });

    it("renders the browser chrome without a tab strip even for legacy multi-tab blocks", () => {
        const blockId = "webview-tabs-block";
        const env = makeMockWaveEnv({
            settings: {
                "web:defaulturl": "https://kronterm.dev",
            },
            mockWaveObjs: {
                [`block:${blockId}`]: {
                    otype: "block",
                    oid: blockId,
                    version: 1,
                    meta: {
                        url: "https://kronterm.dev/docs",
                        "web:tabs": [
                            { id: "docs", url: "https://kronterm.dev/docs", title: "Docs" },
                            { id: "api", url: "https://kronterm.dev/api", title: "API" },
                        ],
                        "web:activetabid": "docs",
                    },
                } as Block,
            },
        });
        const model = new WebViewModel({
            blockId,
            nodeModel: {
                blockId,
                isFocused: atom(true),
                isMagnified: atom(false),
                isFolded: atom(false),
                focusNode: () => {},
                toggleMagnify: () => {},
                toggleFold: () => {},
                onClose: () => {},
            },
            tabModel: {} as any,
            waveEnv: env,
        });

        const markup = renderToStaticMarkup(<>{globalStore.get(model.headerTop)}</>);

        expect(markup).toContain("webview-navigation");
        expect(markup).toContain('aria-label="Find in page"');
        expect(markup).toContain('aria-label="Open browser DevTools"');
        expect(markup).toContain('aria-label="Browser menu"');
        expect(markup).toContain("Viewport profile");
        expect(markup).not.toContain("webview-tab-strip");
        expect(markup).not.toContain('role="tablist"');
        expect(markup).not.toContain('role="tab"');
        expect(markup).not.toContain('aria-label="New browser tab"');
    });
});
