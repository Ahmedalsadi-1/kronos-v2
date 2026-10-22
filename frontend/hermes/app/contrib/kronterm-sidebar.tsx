import { useStore } from "@nanostores/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { SidebarProvider } from "@hermes/components/ui/sidebar";
import {
    $krontermInspectorTarget,
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    KrontermSidebarActivateEvent,
    registerKrontermSidebarOwner,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen } from "@hermes/store/layout";
import { KrontermInspector } from "./kronterm-inspector";

export function KrontermSidebar({ children, preferred = false }: { children: ReactNode; preferred?: boolean }) {
    const target = useStore($krontermSidebarTarget);
    const inspectorTarget = useStore($krontermInspectorTarget);
    const owner = useStore($krontermSidebarOwner);
    const open = useStore($sidebarOpen);
    const [identity] = useState(() => Symbol("kronterm-sidebar"));

    useEffect(() => registerKrontermSidebarOwner(identity, preferred), [identity, preferred]);

    if (owner !== identity) return null;

    return (
        <>
            {target &&
                createPortal(
                    <div
                        data-hermes-app=""
                        onClick={(event) => {
                            if ((event.target as HTMLElement).closest("button, a")) {
                                window.dispatchEvent(new Event(KrontermSidebarActivateEvent));
                            }
                        }}
                        className="h-full min-h-0 w-full"
                        style={{ "--titlebar-height": "0px" } as CSSProperties}
                    >
                        <SidebarProvider
                            open={open}
                            onOpenChange={setSidebarOpen}
                            className="h-full min-h-0"
                            style={{ "--sidebar-width": "100%" } as CSSProperties}
                        >
                            {children}
                        </SidebarProvider>
                    </div>,
                    target
                )}
            {inspectorTarget &&
                createPortal(
                    <div
                        data-hermes-app=""
                        className="h-full min-h-0 w-full"
                        style={{ "--titlebar-height": "0px" } as CSSProperties}
                    >
                        <KrontermInspector />
                    </div>,
                    inspectorTarget
                )}
        </>
    );
}
