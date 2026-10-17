// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, type ReactNode } from "react";

type BlockChromeMode = "default" | "integrated";

const BlockChromeContext = createContext<BlockChromeMode>("default");
const BlockToolbarHostContext = createContext<HTMLElement>(null);

function BlockChromeProvider({ children, mode, toolbarHost }: {
    children: ReactNode;
    mode: BlockChromeMode;
    toolbarHost?: HTMLElement;
}) {
    return (
        <BlockChromeContext.Provider value={mode}>
            <BlockToolbarHostContext.Provider value={toolbarHost}>{children}</BlockToolbarHostContext.Provider>
        </BlockChromeContext.Provider>
    );
}

function useBlockChrome(): BlockChromeMode {
    return useContext(BlockChromeContext);
}

function useBlockToolbarHost(): HTMLElement {
    return useContext(BlockToolbarHostContext);
}

export { BlockChromeProvider, useBlockChrome, useBlockToolbarHost, type BlockChromeMode };
