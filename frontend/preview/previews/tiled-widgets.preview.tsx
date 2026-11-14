// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersistentBlock, PersistentBlockProvider } from "@/app/block/persistent-block";
import { BlockService, ObjectService } from "@/app/store/services";
import { getTabModelByTabId, TabModelContext } from "@/app/store/tab-model";
import * as WOS from "@/app/store/wos";
import "@/app/tab/widget-tabs-layout.scss";
import { publishWorkspacePresentation, readWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { WaveEnvContext } from "@/app/waveenv/waveenv";
import { WorkspaceTabManager } from "@/app/workspace/workspace-tab-manager";
import { TileLayout } from "@/layout/lib/TileLayout";
import { FlexDirection, type TileLayoutContents } from "@/layout/lib/types";
import { makeMockWaveEnv } from "@/preview/mock/mockwaveenv";
import { getFileTreeDndManager } from "@hermes/app/right-sidebar/files/dnd-manager";
import { $sidebarOpen, setSidebarOpen } from "@hermes/store/layout";
import { useLayoutEffect, useMemo, useState } from "react";
import { DndProvider } from "react-dnd";

const PreviewTabId = "tiled-widgets-component-preview";
const PreviewLayoutId = "tiled-widgets-component-layout";
const FilesBlockId = "tiled-preview-files";
const DirectoryBlockId = "tiled-preview-directory";
const BlockIds = [FilesBlockId, DirectoryBlockId];
const PreviewBlocks = {
    [FilesBlockId]: { view: "preview", file: "/Users/mike/Documents/meeting-notes.md" },
    [DirectoryBlockId]: { view: "preview", file: "/Users/mike/Downloads" },
};

export function TiledWidgetsPreview() {
    const [ready, setReady] = useState(false);
    const preview = useMemo(() => {
        const objects: Record<string, WaveObj> = {};
        for (const [id, meta] of Object.entries(PreviewBlocks)) {
            objects[`block:${id}`] = { oid: id, otype: "block", version: 1, meta } as Block;
        }
        objects[`layout:${PreviewLayoutId}`] = {
            oid: PreviewLayoutId,
            otype: "layout",
            version: 1,
            rootnode: {
                id: "tiled-preview-root",
                flexDirection: FlexDirection.Row,
                size: 100,
                children: BlockIds.map((id) => ({
                    id,
                    flexDirection: FlexDirection.Row,
                    size: 50,
                    data: { blockId: id },
                })),
            },
            focusednodeid: FilesBlockId,
        } as LayoutState;
        objects[`tab:${PreviewTabId}`] = {
            oid: PreviewTabId,
            otype: "tab",
            version: 1,
            name: "Tiled Files preview",
            layoutstate: PreviewLayoutId,
            blockids: BlockIds,
            meta: {},
        } as Tab;
        for (const object of Object.values(objects)) {
            WOS.mockObjectForPreview(WOS.makeORef(object.otype, object.oid), object);
            WOS.updateWaveObject({ oid: object.oid, otype: object.otype, updatetype: "update", obj: object });
        }
        const env = makeMockWaveEnv({ tabId: PreviewTabId, mockWaveObjs: objects });
        const tabModel = getTabModelByTabId(PreviewTabId, env);
        const contents: TileLayoutContents = {
            tabId: PreviewTabId,
            gapSizePx: 6,
            renderContent: (nodeModel) => <PersistentBlock nodeModel={nodeModel} preview={false} />,
            renderPreview: (nodeModel) => <PersistentBlock nodeModel={nodeModel} preview />,
        };
        return { env, tabModel, tabAtom: WOS.getWaveObjectAtom<Tab>(`tab:${PreviewTabId}`), contents };
    }, []);

    useLayoutEffect(() => {
        const previousBlockEnv = BlockService.waveEnv;
        const previousObjectEnv = ObjectService.waveEnv;
        const previousPresentation = readWorkspacePresentation();
        const previousSidebarOpen = $sidebarOpen.get();
        BlockService.waveEnv = preview.env;
        ObjectService.waveEnv = preview.env;
        publishWorkspacePresentation("widgets");
        setSidebarOpen(false);
        setReady(true);
        return () => {
            BlockService.waveEnv = previousBlockEnv;
            ObjectService.waveEnv = previousObjectEnv;
            publishWorkspacePresentation(previousPresentation);
            setSidebarOpen(previousSidebarOpen);
        };
    }, [preview.env]);

    return (
        <WaveEnvContext.Provider value={preview.env}>
            <TabModelContext.Provider value={preview.tabModel}>
                <DndProvider manager={getFileTreeDndManager()}>
                    <div className="flex h-full min-h-0 w-full flex-1 flex-col px-2">
                        <p className="m-0 shrink-0 px-2 py-2 text-xs text-muted-foreground">
                            Tiled widgets with sample files. Drag the divider or focus it and press Left or Right.
                        </p>
                        <div className="relative min-h-0 flex-1 overflow-hidden">
                            {ready && (
                                <PersistentBlockProvider blockIds={BlockIds}>
                                    <WorkspaceTabManager>
                                        <TileLayout tabAtom={preview.tabAtom} contents={preview.contents} />
                                    </WorkspaceTabManager>
                                </PersistentBlockProvider>
                            )}
                        </div>
                    </div>
                </DndProvider>
            </TabModelContext.Provider>
        </WaveEnvContext.Provider>
    );
}
