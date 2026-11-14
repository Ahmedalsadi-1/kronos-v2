// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { publishWorkspacePresentation, readWebReturnPresentation } from "@/app/tab/workspace-presentation";
import { configureHermesDesktopShim, installHermesDesktopShim } from "@/app/view/hermes/hermes-desktop-shim";
import { getApi } from "@/store/global";
import { markKronTermWebHost, markKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import { lazy, memo, type ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import "./web-mode.scss";

const LazyHermesApp = lazy(async () => ({ default: (await import("@/app/view/hermes/hermes-app")).HermesApp }));

type WebCapabilityPreset = "web-agent" | "developer" | "research" | "custom";
type StoredWebCapabilities = HermesWebCapabilities & { preset: WebCapabilityPreset };

const WebCapabilityPresets: Record<Exclude<WebCapabilityPreset, "custom">, HermesWebCapabilities> = {
    "web-agent": { browser: true, terminal: true, files: true, sandbox: true, computerControl: false },
    developer: { browser: true, terminal: true, files: true, sandbox: true, computerControl: false },
    research: { browser: true, terminal: false, files: true, sandbox: false, computerControl: false },
};

const DefaultWebCapabilities: StoredWebCapabilities = {
    preset: "web-agent",
    browser: true,
    terminal: true,
    files: true,
    sandbox: true,
    computerControl: false,
};

function normalizeWebCapabilities(value?: Partial<StoredWebCapabilities>): StoredWebCapabilities {
    const preset =
        value?.preset && value.preset in WebCapabilityPresets
            ? value.preset
            : value?.preset === "custom"
              ? "custom"
              : "web-agent";
    const base = preset === "custom" ? DefaultWebCapabilities : WebCapabilityPresets[preset];
    return { ...base, ...value, preset };
}

type WebModeRuntimeState =
    | { status: "starting" }
    | { status: "ready"; connection: HermesConnectionDescriptor }
    | { status: "error"; message: string };

interface WebModeSurfaceProps {
    children?: ReactNode;
    onExit: () => void;
    onRetry?: () => void;
    runtime: Pick<WebModeRuntimeState, "status"> & { message?: string };
}

function WebModeSurface({ children, onExit, onRetry, runtime }: WebModeSurfaceProps) {
    return (
        <section className="web-mode" aria-label="Kronos web mode" data-hermes-web-mode="">
            {runtime.status === "ready" ? (
                children
            ) : runtime.status === "starting" ? (
                <div className="web-mode-status" role="status">
                    <div className="web-mode-spinner" />
                    <span>Starting Kronos…</span>
                </div>
            ) : (
                <div className="web-mode-status" role="alert">
                    <h3>KronOS Agent could not start</h3>
                    <p className="web-mode-error">{runtime.message}</p>
                    <button type="button" className="web-mode-retry" onClick={onRetry}>
                        Retry
                    </button>
                </div>
            )}
            <button
                type="button"
                className="web-mode-exit"
                onClick={onExit}
                aria-label="Exit web mode"
                title="Exit web mode (Esc)"
            >
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                <span>Exit Web</span>
            </button>
        </section>
    );
}

const WebModeView = memo(
    ({
        tabId,
        workspaceId,
        initialCapabilities,
    }: {
        tabId: string;
        workspaceId: string;
        initialCapabilities?: Partial<StoredWebCapabilities>;
    }) => {
        const [runtime, setRuntime] = useState<WebModeRuntimeState>({ status: "starting" });
        const [retryKey, setRetryKey] = useState(0);
        const [capabilities, setCapabilities] = useState(() => normalizeWebCapabilities(initialCapabilities));
        useEffect(() => {
            markKronTermWidgetHost();
            markKronTermWebHost(true);
            installHermesDesktopShim();
            return () => markKronTermWebHost(false);
        }, []);

        useEffect(() => {
            let active = true;
            const applyConnection = (connection: HermesConnectionDescriptor) => {
                if (!active) {
                    return;
                }
                configureHermesDesktopShim({ baseUrl: connection.baseUrl, token: connection.token });
                setRuntime({ status: "ready", connection });
            };
            const unsubscribe = getApi().onHermesConnection(applyConnection);
            setRuntime({ status: "starting" });
            void getApi()
                .hermesGetConnection({
                    tabId,
                    workspaceId,
                    hostMode: "web-fullscreen",
                    capabilities,
                })
                .then(applyConnection)
                .catch((error) => {
                    if (!active) {
                        return;
                    }
                    setRuntime({ status: "error", message: error instanceof Error ? error.message : String(error) });
                });
            return () => {
                active = false;
                unsubscribe();
            };
        }, [capabilities, retryKey, tabId, workspaceId]);

        const persistCapabilities = useCallback(
            (next: StoredWebCapabilities) => {
                setCapabilities(next);
                void RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("workspace", workspaceId),
                    meta: { "hermes:webcapabilities": next } as unknown as MetaType,
                });
            },
            [workspaceId]
        );

        const exitWebMode = useCallback(() => {
            const presentation = publishWorkspacePresentation(readWebReturnPresentation());
            void RpcApi.SetConfigCommand(TabRpcClient, { "app:layoutmode": presentation });
        }, []);

        useEffect(() => {
            let pendingExit: number;
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
                window.clearTimeout(pendingExit);
                // The composer can claim Escape in its own window listener.
                pendingExit = window.setTimeout(() => {
                    if (!event.defaultPrevented) exitWebMode();
                }, 0);
            };
            window.addEventListener("keydown", handleKeyDown);
            return () => {
                window.clearTimeout(pendingExit);
                window.removeEventListener("keydown", handleKeyDown);
            };
        }, [exitWebMode]);

        useEffect(() => {
            const handleSandbox = (event: Event) => {
                const open = (event as CustomEvent<{ open?: boolean }>).detail?.open;
                if (open === false) return;
                void window.hermesDesktop?.krontermSurfaces?.openMachines?.("desktop").then((result) => {
                    if (!result.ok) console.error(result.error);
                });
            };
            window.addEventListener("kronterm:hermes-web-sandbox", handleSandbox);
            return () => window.removeEventListener("kronterm:hermes-web-sandbox", handleSandbox);
        }, []);

        return (
            <WebModeSurface onExit={exitWebMode} onRetry={() => setRetryKey((value) => value + 1)} runtime={runtime}>
                {runtime.status === "ready" && (
                    <Suspense
                        fallback={
                            <div className="web-mode-status" role="status">
                                Loading Kronos…
                            </div>
                        }
                    >
                        <LazyHermesApp key={runtime.connection.baseUrl} hostMode="web-fullscreen" webMode />
                    </Suspense>
                )}
                <details className="web-mode-tools">
                    <summary>
                        <i className="fa-solid fa-sliders" aria-hidden="true" /> Tools
                    </summary>
                    <div className="web-mode-tools-panel">
                        <label>
                            Preset
                            <select
                                value={capabilities.preset}
                                onChange={(event) => {
                                    const preset = event.target.value as WebCapabilityPreset;
                                    persistCapabilities(
                                        normalizeWebCapabilities({
                                            ...(preset === "custom" ? capabilities : WebCapabilityPresets[preset]),
                                            preset,
                                        })
                                    );
                                }}
                            >
                                <option value="web-agent">Web agent</option>
                                <option value="developer">Developer</option>
                                <option value="research">Research</option>
                                <option value="custom">Custom</option>
                            </select>
                        </label>
                        {(["browser", "terminal", "files", "sandbox", "computerControl"] as const).map((key) => (
                            <label key={key}>
                                <input
                                    type="checkbox"
                                    checked={capabilities[key]}
                                    onChange={(event) =>
                                        persistCapabilities({
                                            ...capabilities,
                                            preset: "custom",
                                            [key]: event.target.checked,
                                        })
                                    }
                                />
                                {key === "computerControl" ? "Computer control" : key[0].toUpperCase() + key.slice(1)}
                            </label>
                        ))}
                    </div>
                </details>
            </WebModeSurface>
        );
    }
);
WebModeView.displayName = "WebModeView";

export { WebModeSurface, WebModeView };
export type { WebModeRuntimeState };
