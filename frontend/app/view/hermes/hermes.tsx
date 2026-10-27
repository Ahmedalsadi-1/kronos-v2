import { uxCloseBlock } from "@/app/store/keymodel";
import { createBlock, getApi, refocusNode } from "@/store/global";
import { markKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { configureHermesDesktopShim, installHermesDesktopShim } from "./hermes-desktop-shim";
import type { HermesViewModel } from "./hermes-model";
import { hermesSurfaceController } from "./hermes-surface-controller";

type HermesViewProps = {
    blockId: string;
    blockRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
    model: HermesViewModel;
};

let shimInstalled = false;

const LazyHermesApp = lazy(async () => ({ default: (await import("./hermes-app")).HermesApp }));

function ensureShim(): void {
    markKronTermWidgetHost();
    if (shimInstalled) {
        return;
    }
    shimInstalled = true;
    installHermesDesktopShim({ baseUrl: "http://127.0.0.1:9119" });
}

type RuntimeState =
    | { status: "starting" }
    | { status: "ready"; connection: HermesConnectionDescriptor }
    | { status: "error"; message: string };

export function HermesView({ blockId, contentRef, model }: HermesViewProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [runtime, setRuntime] = useState<RuntimeState>({ status: "starting" });
    const [retryKey, setRetryKey] = useState(0);
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const surfaceActive = surface.presentation === "widget" && surface.widgetBlockId === blockId;
    ensureShim();

    useEffect(
        () =>
            hermesSurfaceController.registerWidgetHost({
                blockId,
                closeToHud: () => uxCloseBlock(model.blockId, () => model.nodeModel.onClose()),
            }),
        [blockId, model]
    );

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const meta = detail?.meta;
            if (meta && typeof meta === "object" && typeof meta.view === "string" && meta.view) {
                createBlock({ meta }, false);
                return;
            }
            const view = detail?.view;
            if (typeof view === "string" && view) {
                createBlock({ meta: { view } }, false);
            }
        };
        window.addEventListener("kronterm:create-widget", handler);
        return () => window.removeEventListener("kronterm:create-widget", handler);
    }, []);

    useEffect(() => {
        if (surface.presentation === "widget" && surface.widgetBlockId && surface.widgetBlockId !== blockId) {
            refocusNode(surface.widgetBlockId);
        }
    }, [blockId, surface.presentation, surface.widgetBlockId]);

    useEffect(() => {
        if (!surfaceActive) {
            return;
        }
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
            .hermesGetConnection({ tabId: model.tabModel.tabId, blockId })
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
    }, [blockId, model.tabModel.tabId, retryKey, surfaceActive]);

    const activateSurface = () => {
        if (!surfaceActive) {
            hermesSurfaceController.activateWidget(blockId);
            return;
        }
        void getApi()
            .hermesGetConnection({ tabId: model.tabModel.tabId, blockId })
            .catch((error) => console.warn("Kronos surface activation failed", error));
    };

    return (
        <div
            ref={contentRef}
            onFocusCapture={activateSurface}
            onPointerDown={activateSurface}
            className="hermes-view-container relative"
            style={{ width: "100%", height: "100%", overflow: "hidden" }}
        >
            <div ref={mountRef} style={{ width: "100%", height: "100%" }}>
                {!surfaceActive && (
                    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                        Kronos is active in another widget.
                    </div>
                )}
                {surfaceActive && runtime.status === "starting" && (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Starting Kronos…
                    </div>
                )}
                {surfaceActive && runtime.status === "error" && (
                    <div className="flex h-full items-center justify-center p-8">
                        <div className="max-w-xl rounded-lg border border-red-500/30 bg-red-500/5 p-5">
                            <div className="font-semibold">Kronos could not start</div>
                            <div className="mt-2 text-sm text-muted-foreground">{runtime.message}</div>
                            <button
                                type="button"
                                onClick={() => setRetryKey((value) => value + 1)}
                                className="mt-4 cursor-pointer rounded bg-accent/80 px-3 py-2 text-primary transition-colors hover:bg-accent"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}
                {surfaceActive && runtime.status === "ready" && (
                    <Suspense
                        fallback={
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                Loading Kronos…
                            </div>
                        }
                    >
                        <LazyHermesApp key={runtime.connection.baseUrl} kronSettingsModel={model.kronSettingsModel} />
                    </Suspense>
                )}
            </div>
        </div>
    );
}
