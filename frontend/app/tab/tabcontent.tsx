// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersistentBlockProvider } from "@/app/block/persistent-block";
import { atoms, createTab, setActiveTab } from "@/store/global";
import * as WOS from "@/store/wos";
import { useAtomValue } from "jotai";
import { memo, useMemo } from "react";
import { OSModeView } from "./os-workspace";
import "./tabcontent.scss";

const TabContent = memo(({ tabId }: { tabId: string }) => {
    const oref = useMemo(() => WOS.makeORef("tab", tabId), [tabId]);
    const loadingAtom = useMemo(() => WOS.getWaveObjectLoadingAtom(oref), [oref]);
    const tabLoading = useAtomValue(loadingAtom);
    const tabAtom = useMemo(() => WOS.getWaveObjectAtom<Tab>(oref), [oref]);
    const tabData = useAtomValue(tabAtom);
    const workspace = useAtomValue(atoms.workspace);
    const fallbackTabId = workspace?.tabids?.find((workspaceTabId) => workspaceTabId !== tabId);

    let innerContent;

    if (tabLoading) {
        innerContent = (
            <div className="workspace-tab-state" role="status">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                <strong>Loading workspace tab</strong>
                <span>Your widgets will appear when the tab is ready.</span>
            </div>
        );
    } else if (!tabData) {
        innerContent = (
            <div className="workspace-tab-state is-error" role="alert">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <strong>Workspace tab not found</strong>
                <span>It may have been closed in another window.</span>
                <button type="button" onClick={() => (fallbackTabId ? setActiveTab(fallbackTabId) : createTab())}>
                    {fallbackTabId ? "Return to workspace" : "Create a tab"}
                </button>
            </div>
        );
    } else {
        innerContent = <OSModeView key={tabId} tabId={tabId} tabData={tabData} />;
    }

    return (
        <div className="workspace-compact-chrome relative flex min-h-0 w-full flex-grow flex-col items-center justify-center overflow-hidden">
            <PersistentBlockProvider blockIds={tabData?.blockids ?? []}>{innerContent}</PersistentBlockProvider>
        </div>
    );
});

export { TabContent };
