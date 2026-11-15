import { getApi } from "@/store/global";
import { registerCanvasToolbar } from "./react-grab-canvas-toolbar";

export function shouldEnableReactGrab(_dev: boolean, enableFlag: string | undefined): boolean {
    return enableFlag !== "false";
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
            const activate = () => {
                if (document.documentElement.hasAttribute("data-kronterm-browser-tool-owner")) return;
                if (!api.getToolbarState()?.enabled) api.setToolbarState({ enabled: true });
                api.activate();
            };
            window.addEventListener("kronterm:workspace-picker-activate", activate);
            const deactivate = () => api.deactivate();
            window.addEventListener("kronterm:workspace-picker-deactivate", deactivate);
            syncBrowserOwner();
            window.addEventListener("kronterm-browser-tool-owner", syncBrowserOwner);
            import.meta.hot?.dispose(() => {
                window.removeEventListener("kronterm-browser-tool-owner", syncBrowserOwner);
                window.removeEventListener("kronterm:workspace-picker-deactivate", deactivate);
                window.removeEventListener("kronterm:workspace-picker-activate", activate);
                releaseCanvasToolbar();
                api.unregisterPlugin("kronterm-input-ownership");
                initialized = false;
            });
            api.registerPlugin({
                name: "kronterm-input-ownership",
                actions: [
                    {
                        id: "kronterm-hermes-context",
                        label: "Add to Hermes",
                        showInToolbarMenu: true,
                        onAction: async ({ element, hideContextMenu, performWithFeedback }) => {
                            hideContextMenu();
                            await performWithFeedback(async () => {
                                const block = element.closest("[data-live-blockid], [data-blockid]");
                                const blockId =
                                    block?.getAttribute("data-live-blockid") ?? block?.getAttribute("data-blockid");
                                const component = api.getDisplayName(element) ?? element.tagName.toLowerCase();
                                const label = (
                                    element.getAttribute("aria-label") ?? element.getAttribute("title")
                                )?.slice(0, 250);
                                const source = (await api.getStackContext(element)).slice(0, 2000);
                                await getApi().sendHermesContext(
                                    `Selected KronOS element: ${component}${label ? ` (${label})` : ""}${blockId ? `\nWidget: @widget:${blockId}` : ""}${source ? `\n${source}` : ""}`
                                );
                                return true;
                            });
                        },
                    },
                ],
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
            console.warn("KronOS UI selector could not initialize", error);
        });
}
