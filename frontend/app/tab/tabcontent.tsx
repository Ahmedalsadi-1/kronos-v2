// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersistentBlock as Block, PersistentBlockProvider } from "@/app/block/persistent-block";
import { Widgets } from "@/app/workspace/widgets";
import { WorkspaceTabManager } from "@/app/workspace/workspace-tab-manager";
import { TileLayout } from "@/layout/lib/TileLayout";
import { ContentRenderer, NodeModel, PreviewRenderer, TileLayoutContents } from "@/layout/lib/types";
import { atoms, createTab, getApi, getSettingsKeyAtom, setActiveTab } from "@/store/global";
import * as services from "@/store/services";
import * as WOS from "@/store/wos";
import { atom, useAtomValue } from "jotai";
import * as React from "react";
import { useMemo, useSyncExternalStore } from "react";
import { OSModeView } from "./os-workspace";
import "./tabcontent.scss";
import { WidgetTabsLayout } from "./widget-tabs-layout";
import {
    normalizeWorkspacePresentation,
    readWorkspacePresentation,
    subscribeWorkspacePresentation,
} from "./workspace-presentation";

const tileGapSizeAtom = atom((get) => {
    const settings = get(atoms.settingsAtom);
    return settings["window:tilegapsize"];
});

const TabContent = React.memo(
    ({
        tabId,
        noTopPadding,
        showCollapsedLauncher,
    }: {
        tabId: string;
        noTopPadding?: boolean;
        showCollapsedLauncher?: boolean;
    }) => {
        const oref = useMemo(() => WOS.makeORef("tab", tabId), [tabId]);
        const loadingAtom = useMemo(() => WOS.getWaveObjectLoadingAtom(oref), [oref]);
        const tabLoading = useAtomValue(loadingAtom);
        const tabAtom = useMemo(() => WOS.getWaveObjectAtom<Tab>(oref), [oref]);
        const tabData = useAtomValue(tabAtom);
        const tileGapSize = useAtomValue(tileGapSizeAtom);
        const workspace = useAtomValue(atoms.workspace);
        const settingsLayoutModeValue = useAtomValue(getSettingsKeyAtom("app:layoutmode" as keyof SettingsType)) as
            string | null;
        const settingsLayoutMode = normalizeWorkspacePresentation(settingsLayoutModeValue) ?? "os";
        const layoutMode = useSyncExternalStore(
            subscribeWorkspacePresentation,
            () => readWorkspacePresentation(settingsLayoutMode),
            () => settingsLayoutMode
        );
        const fallbackTabId = workspace?.tabids?.find((workspaceTabId) => workspaceTabId !== tabId);

        const tileLayoutContents = useMemo(() => {
            const renderContent: ContentRenderer = (nodeModel: NodeModel) => {
                return <Block key={nodeModel.blockId} nodeModel={nodeModel} preview={false} />;
            };

            const renderPreview: PreviewRenderer = (nodeModel: NodeModel) => {
                return <Block key={nodeModel.blockId} nodeModel={nodeModel} preview={true} />;
            };

            function onNodeDelete(data: TabLayoutData) {
                return services.ObjectService.DeleteBlock(data.blockId);
            }

            return {
                renderContent,
                renderPreview,
                tabId,
                onNodeDelete,
                gapSizePx: tileGapSize,
            } as TileLayoutContents;
        }, [tabId, tileGapSize]);

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
        } else if (layoutMode === "os") {
            innerContent = <OSModeView key={`os-${tabId}`} tabId={tabId} tabData={tabData} />;
        } else if (tabData?.blockids?.length == 0) {
            innerContent = (
                <div className="workspace-tab-empty">
                    <div className="workspace-tab-state">
                        <i className="fa-solid fa-window-restore" aria-hidden="true" />
                        <strong>This tab is empty</strong>
                        <span>Choose a widget to start working.</span>
                    </div>
                    <Widgets catalog />
                </div>
            );
        } else if (layoutMode === "tabs") {
            innerContent = <WidgetTabsLayout key={`tabs-${tabId}`} contents={tileLayoutContents} tabAtom={tabAtom} />;
        } else {
            innerContent = (
                <TileLayout
                    key={tabId}
                    contents={tileLayoutContents}
                    tabAtom={tabAtom}
                    getCursorPoint={getApi().getCursorPoint}
                />
            );
        }

        const showWidgetLauncher = showCollapsedLauncher && layoutMode === "widgets";

        return (
            <div
                className={`flex flex-col flex-grow min-h-0 w-full items-center justify-center overflow-hidden relative ${layoutMode === "os" ? "workspace-compact-chrome" : `${noTopPadding ? "" : "pt-[3px]"} pr-[3px]`}`}
            >
                <PersistentBlockProvider blockIds={tabData?.blockids ?? []}>
                    {layoutMode === "widgets" ? (
                        <WorkspaceTabManager>{innerContent}</WorkspaceTabManager>
                    ) : (
                        innerContent
                    )}
                </PersistentBlockProvider>
                {showWidgetLauncher && (
                    <div className="workspace-collapsed-widget-launcher">
                        <Widgets compact />
                    </div>
                )}
            </div>
        );
    }
);

export { TabContent };
