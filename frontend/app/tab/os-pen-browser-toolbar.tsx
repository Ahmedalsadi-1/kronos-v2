// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OSWebNavBar } from "./os-web-navbar";

export function OSPenBrowserToolbar({ blockId, target }: { blockId: string; target?: HTMLElement }) {
    const home = useRef<HTMLDivElement>(null);
    const [host] = useState(() => {
        const element = document.createElement("div");
        element.className = "pen-browser-toolbar";
        return element;
    });
    useLayoutEffect(() => {
        // A stable portal container preserves the address input and toolbar state across documents.
        (target ?? home.current)?.append(host);
        return () => host.remove();
    }, [host, target]);
    return (
        <>
            <div ref={home} className="pen-browser-toolbar-home" />
            {createPortal(<OSWebNavBar blockId={blockId} companion syncNativeHeader={false} />, host)}
        </>
    );
}
