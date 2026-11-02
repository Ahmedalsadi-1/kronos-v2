import { registerCanvasToolbar } from "./react-grab-canvas-toolbar";

export function shouldEnableReactGrab(dev: boolean, enableFlag: string | undefined): boolean {
    return dev && enableFlag !== "false";
}

export function selectReactGrabApi(module: Pick<typeof import("react-grab"), "getGlobalApi" | "init">) {
    return module.getGlobalApi() ?? module.init({ telemetry: false });
}

let initialized = false;

export function initializeReactGrab(): void {
    if (initialized || typeof window === "undefined") return;
    if (!shouldEnableReactGrab(import.meta.env.DEV, import.meta.env.VITE_ENABLE_REACT_GRAB)) return;
    initialized = true;
    void Promise.all([import("react-grab"), import("react-grab/styles.css")])
        .then(([reactGrab]) => {
            const api = selectReactGrabApi(reactGrab);
            const releaseCanvasToolbar = registerCanvasToolbar(api);
            const syncBrowserOwner = () => {
                const browserOwnsTool = document.documentElement.hasAttribute("data-kronterm-browser-tool-owner");
                if (browserOwnsTool) api.deactivate();
                api.setToolbarState({ enabled: !browserOwnsTool });
            };
            syncBrowserOwner();
            window.addEventListener("kronterm-browser-tool-owner", syncBrowserOwner);
            import.meta.hot?.dispose(() => {
                window.removeEventListener("kronterm-browser-tool-owner", syncBrowserOwner);
                releaseCanvasToolbar();
                api.unregisterPlugin("kronterm-input-ownership");
                initialized = false;
            });
            api.registerPlugin({
                name: "kronterm-input-ownership",
                hooks: {
                    onStateChange: (state) => {
                        document.documentElement.toggleAttribute(
                            "data-kronterm-selector-active",
                            state.isActive || state.isPromptMode
                        );
                    },
                    onActivate: () => document.documentElement.setAttribute("data-kronterm-selector-active", ""),
                    onDeactivate: () => {
                        document.documentElement.toggleAttribute(
                            "data-kronterm-selector-active",
                            api.getState().isPromptMode
                        );
                    },
                    onPromptModeChange: (active) => {
                        document.documentElement.toggleAttribute(
                            "data-kronterm-selector-active",
                            active || api.isActive()
                        );
                    },
                },
            });
        })
        .catch((error) => {
            initialized = false;
            console.warn("KronTerm UI selector could not initialize", error);
        });
}
