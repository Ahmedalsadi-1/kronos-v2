// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserToolbarMenu } from "./browser-toolbar-menu";

const noop = () => {};
const props = {
    deviceProfile: "default" as const,
    onClearHistory: noop,
    onClearSiteData: noop,
    onCopyUrl: noop,
    onDeviceProfileChange: noop,
    onHardReload: noop,
    onHome: noop,
    onZoomChange: noop,
    zoom: 1,
};

describe("browser toolbar overflow", () => {
    it("targets a unique top-layer popover for every live browser", () => {
        const markup = renderToStaticMarkup(
            <>
                <BrowserToolbarMenu {...props} />
                <BrowserToolbarMenu {...props} />
            </>
        );
        const targets = [...markup.matchAll(/popoverTarget="([^"]+)"/gi)].map((match) => match[1]);
        expect(targets).toHaveLength(2);
        expect(new Set(targets).size).toBe(2);
        for (const target of targets) {
            expect(markup).toContain(`id="${target}"`);
        }
        expect(markup.match(/popover="auto"/g)).toHaveLength(2);
    });

    it("keeps tools available when their compact toolbar buttons move into overflow", () => {
        const markup = renderToStaticMarkup(
            <BrowserToolbarMenu
                {...props}
                inspectMode
                onInspect={noop}
                onFind={noop}
                onDevTools={noop}
                onOpenExternal={noop}
            />
        );
        expect(markup).toContain("Stop browser element picker");
        expect(markup).toContain("Find in page");
        expect(markup).toContain("Open browser DevTools");
        expect(markup).toContain("Open in external browser");
        expect(markup).toContain("Viewport profile");
    });

    it("includes session, cookie, annotation, markup and settings actions", () => {
        const markup = renderToStaticMarkup(
            <BrowserToolbarMenu
                {...props}
                onSessionChange={noop}
                sessionProfile="work"
                onImportCookies={noop}
                onAnnotate={noop}
                onMarkup={noop}
                onSettings={noop}
                onResearch={noop}
            />
        );
        expect(markup).toContain("Browser session profile");
        expect(markup).toContain("Import session cookies");
        expect(markup).toContain("Screenshot markup");
        expect(markup).toContain("Research notebook");
        expect(markup).toContain("Annotate browser element");
        expect(markup).toContain("Browser settings");
    });
});
