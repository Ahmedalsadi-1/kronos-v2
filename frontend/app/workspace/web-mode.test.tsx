// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WebModeSurface } from "./web-mode";

describe("Hermes web mode surface", () => {
    it("fills the web-mode surface with the Hermes shell when the runtime is ready", () => {
        const markup = renderToStaticMarkup(
            <WebModeSurface onExit={vi.fn()} runtime={{ status: "ready" }}>
                <div data-hermes-web-shell="" />
            </WebModeSurface>
        );

        expect(markup).toContain('data-hermes-web-shell=""');
        expect(markup).not.toContain("<iframe");
    });

    it("keeps the runtime failure recoverable", () => {
        const markup = renderToStaticMarkup(
            <WebModeSurface onExit={vi.fn()} onRetry={vi.fn()} runtime={{ status: "error", message: "offline" }} />
        );

        expect(markup).toContain("KronTerm Agent could not start");
        expect(markup).toContain("offline");
        expect(markup).toContain("Retry");
    });
});
