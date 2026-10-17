import { describe, expect, it, vi } from "vitest";

import {
    isWebModeTitlebarTool,
    makeHermesWebPaneLauncher,
    routeKronTermLauncherAction,
    shouldMountHermesInternalTerminal,
    WebModeLauncherWidgets,
} from "./web-pane-launcher";

function makeDependencies() {
    return {
        createTerminal: vi.fn(),
        dispatchKronTermWidget: vi.fn(),
        getPreviewTabs: vi.fn(() => []),
        openPreview: vi.fn(),
        revealFiles: vi.fn(),
        revealSandbox: vi.fn(),
        revealTerminal: vi.fn(),
        selectPreviewTab: vi.fn(),
        showTerminal: vi.fn(),
    };
}

describe("Hermes web pane launcher", () => {
    it("exposes only the four Hermes-native panes", () => {
        expect(WebModeLauncherWidgets.map((item) => item.id)).toEqual(["terminal", "browser", "files", "sandbox"]);
        expect(isWebModeTitlebarTool("kronterm-terminal")).toBe(true);
        expect(isWebModeTitlebarTool("kronterm-browser")).toBe(true);
        expect(isWebModeTitlebarTool("kronterm-files")).toBe(true);
        expect(isWebModeTitlebarTool("kronterm-sandbox")).toBe(true);
        expect(isWebModeTitlebarTool("kronterm-chat")).toBe(false);
    });

    it("creates and reveals an internal terminal", () => {
        const dependencies = makeDependencies();
        const launch = makeHermesWebPaneLauncher(dependencies);

        launch("terminal");

        expect(dependencies.createTerminal).toHaveBeenCalledOnce();
        expect(dependencies.revealTerminal).toHaveBeenCalledOnce();
        expect(dependencies.showTerminal).toHaveBeenCalledWith(true);
    });

    it("mounts xterm inside the web host but not inside normal Hermes widgets", () => {
        expect(
            shouldMountHermesInternalTerminal({
                hudMode: false,
                hudWindow: false,
                webMode: true,
                widgetHost: true,
            })
        ).toBe(true);
        expect(
            shouldMountHermesInternalTerminal({
                hudMode: false,
                hudWindow: false,
                webMode: false,
                widgetHost: true,
            })
        ).toBe(false);
    });

    it("reveals the internal file browser", () => {
        const dependencies = makeDependencies();
        const launch = makeHermesWebPaneLauncher(dependencies);

        launch("files");

        expect(dependencies.revealFiles).toHaveBeenCalledOnce();
    });

    it("reveals the workspace sandbox desktop", () => {
        const dependencies = makeDependencies();
        makeHermesWebPaneLauncher(dependencies)("sandbox");
        expect(dependencies.revealSandbox).toHaveBeenCalledOnce();
    });

    it("focuses an existing browser without replacing its URL", () => {
        const dependencies = makeDependencies();
        dependencies.getPreviewTabs.mockReturnValue([
            {
                id: "url:browser",
                target: { kind: "url", label: "Docs", source: "manual", url: "https://docs.example.com" },
            },
        ]);
        const launch = makeHermesWebPaneLauncher(dependencies);

        launch("browser");

        expect(dependencies.selectPreviewTab).toHaveBeenCalledWith("url:browser");
        expect(dependencies.openPreview).not.toHaveBeenCalled();
    });

    it("opens the default browser only when no browser exists", () => {
        const dependencies = makeDependencies();
        const launch = makeHermesWebPaneLauncher(dependencies);

        launch("browser");

        expect(dependencies.openPreview).toHaveBeenCalledWith(
            {
                kind: "url",
                label: "Browser",
                source: "manual",
                url: "https://example.com",
            },
            "manual"
        );
    });

    it("routes web mode internally and normal widget mode through KronTerm", () => {
        const dependencies = makeDependencies();

        routeKronTermLauncherAction("term", true, dependencies);
        routeKronTermLauncherAction("term", false, dependencies);

        expect(dependencies.createTerminal).toHaveBeenCalledOnce();
        expect(dependencies.dispatchKronTermWidget).toHaveBeenCalledWith("term");
    });
});
