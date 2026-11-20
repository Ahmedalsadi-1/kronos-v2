// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, type ReactNode } from "react";

type BlockChromeMode = "default" | "integrated";

const BlockChromeContext = createContext<BlockChromeMode>("default");
const BlockToolbarHostContext = createContext<HTMLElement>(null);
const BlockCloseContext = createContext<() => void>(null);

function BlockChromeProvider({ children, mode, toolbarHost, onClose }: {
    children: ReactNode;
    mode: BlockChromeMode;
    toolbarHost?: HTMLElement;
    onClose?: () => void;
}) {
    return (
        <BlockChromeContext.Provider value={mode}>
            <BlockToolbarHostContext.Provider value={toolbarHost}>
                <BlockCloseContext.Provider value={onClose}>{children}</BlockCloseContext.Provider>
            </BlockToolbarHostContext.Provider>
        </BlockChromeContext.Provider>
    );
}

function useBlockChrome(): BlockChromeMode {
    return useContext(BlockChromeContext);
}

function useBlockToolbarHost(): HTMLElement {
    return useContext(BlockToolbarHostContext);
}

function useBlockClose(): (() => void) | undefined {
    return useContext(BlockCloseContext);
}

export { BlockChromeProvider, useBlockClose, useBlockChrome, useBlockToolbarHost, type BlockChromeMode };
