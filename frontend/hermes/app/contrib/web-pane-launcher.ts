import { setTerminalTakeover } from "@hermes/app/right-sidebar/store";
import { ensureTerminal } from "@hermes/app/right-sidebar/terminal/terminals";
import { revealTreePane } from "@hermes/components/pane-shell/tree/store";
import { selectRightRailTab } from "@hermes/store/layout";
import { revealDesktopPane } from "@hermes/store/pane-focus";
import { $previewTabs, openPreview, type PreviewTab, type PreviewTarget } from "@hermes/store/preview";

export interface KronTermLauncherWidget {
    id: "browser" | "files" | "sandbox" | "terminal";
    description: string;
    icon: string;
    label: string;
    view: "preview" | "sandbox" | "term" | "web";
}

export const WebModeLauncherWidgets: readonly KronTermLauncherWidget[] = [
    { id: "terminal", label: "Terminal", icon: "terminal", view: "term", description: "Open terminal" },
    { id: "browser", label: "Browser", icon: "globe", view: "web", description: "Open browser" },
    { id: "files", label: "Files", icon: "folder", view: "preview", description: "Open files" },
    { id: "sandbox", label: "Computer", icon: "desktop", view: "sandbox", description: "Open Computer widget" },
];

const WebModeTitlebarToolIds = new Set(WebModeLauncherWidgets.map((widget) => `kronterm-${widget.id}`));

export function isWebModeTitlebarTool(id: string): boolean {
    return WebModeTitlebarToolIds.has(id);
}

export function shouldMountHermesInternalTerminal({
    hudMode,
    hudWindow,
    webMode,
    widgetHost,
}: {
    hudMode: boolean;
    hudWindow: boolean;
    webMode: boolean;
    widgetHost: boolean;
}): boolean {
    return !hudMode && (webMode || !hudWindow) && (webMode || !widgetHost);
}

interface HermesWebPaneLauncherDependencies {
    createTerminal: () => unknown;
    dispatchKronTermWidget: (view: string) => void;
    getPreviewTabs: () => readonly PreviewTab[];
    openPreview: (target: PreviewTarget, source: "manual") => void;
    revealFiles: () => unknown;
    revealSandbox: () => unknown;
    revealTerminal: () => unknown;
    selectPreviewTab: (id: string) => void;
    showTerminal: (active: boolean) => void;
}

const DefaultDependencies: HermesWebPaneLauncherDependencies = {
    createTerminal: ensureTerminal,
    dispatchKronTermWidget: (view) => {
        const openComputer = window.hermesDesktop?.krontermSurfaces?.openMachines;
        if (view === "sandbox" && openComputer) {
            void openComputer("desktop").then((result) => {
                if (!result.ok) console.error(result.error);
            });
            return;
        }
        window.dispatchEvent(new CustomEvent("kronterm:create-widget", { detail: { view } }));
    },
    getPreviewTabs: () => $previewTabs.get(),
    openPreview,
    revealFiles: () => revealDesktopPane("files"),
    revealSandbox: () =>
        window.dispatchEvent(new CustomEvent("kronterm:hermes-web-sandbox", { detail: { open: true } })),
    revealTerminal: () => revealTreePane("terminal"),
    selectPreviewTab: selectRightRailTab,
    showTerminal: setTerminalTakeover,
};

export function makeHermesWebPaneLauncher(dependencies: HermesWebPaneLauncherDependencies = DefaultDependencies) {
    return (pane: KronTermLauncherWidget["id"]): void => {
        if (pane === "terminal") {
            dependencies.createTerminal();
            dependencies.revealTerminal();
            dependencies.showTerminal(true);
            return;
        }

        if (pane === "files") {
            dependencies.revealFiles();
            return;
        }

        if (pane === "sandbox") {
            dependencies.revealSandbox();
            return;
        }

        const browser = dependencies.getPreviewTabs().find((tab) => tab.target.kind === "url");
        if (browser) {
            dependencies.selectPreviewTab(browser.id);
            return;
        }

        dependencies.openPreview(
            {
                kind: "url",
                label: "Browser",
                source: "manual",
                url: "https://example.com",
            },
            "manual"
        );
    };
}

export function routeKronTermLauncherAction(
    view: string,
    webMode: boolean,
    dependencies: HermesWebPaneLauncherDependencies = DefaultDependencies
): void {
    const pane = WebModeLauncherWidgets.find((widget) => widget.view === view)?.id;
    if (webMode && pane) {
        makeHermesWebPaneLauncher(dependencies)(pane);
        return;
    }

    dependencies.dispatchKronTermWidget(view);
}
