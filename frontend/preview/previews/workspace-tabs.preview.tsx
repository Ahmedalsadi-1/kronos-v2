// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { BlockService, ObjectService } from "@/app/store/services";
import * as WOS from "@/app/store/wos";
import { WidgetTabsLayout } from "@/app/tab/widget-tabs-layout";
import { WaveEnvContext } from "@/app/waveenv/waveenv";
import { FlexDirection, type TileLayoutContents } from "@/layout/lib/types";
import { makeMockWaveEnv } from "@/preview/mock/mockwaveenv";
import { useLayoutEffect, useMemo, useState } from "react";

const PreviewTabId = "workspace-tabs-component-preview";
const PreviewLayoutId = "workspace-tabs-component-layout";
const PreviewBlocks = [
    { id: "tabs-preview-start", title: "Getting started", view: "tips" },
    { id: "tabs-preview-help", title: "Documentation", view: "help" },
];

export function WorkspaceTabsPreview() {
    const [servicesReady, setServicesReady] = useState(false);
    const preview = useMemo(() => {
        const objects: Record<string, WaveObj> = {};
        for (const entry of PreviewBlocks) {
            objects[`block:${entry.id}`] = {
                oid: entry.id,
                otype: "block",
                version: 1,
                meta: { view: entry.view, "frame:title": entry.title },
            } as Block;
        }
        objects[`layout:${PreviewLayoutId}`] = {
            oid: PreviewLayoutId,
            otype: "layout",
            version: 1,
            rootnode: {
                id: "preview-root",
                flexDirection: FlexDirection.Row,
                size: 100,
                children: PreviewBlocks.map((entry) => ({
                    id: entry.id,
                    flexDirection: FlexDirection.Row,
                    size: 50,
                    data: { blockId: entry.id },
                })),
            },
            focusednodeid: PreviewBlocks[0].id,
        } as LayoutState;
        objects[`tab:${PreviewTabId}`] = {
            oid: PreviewTabId,
            otype: "tab",
            version: 1,
            name: "Tabs component preview",
            layoutstate: PreviewLayoutId,
            blockids: PreviewBlocks.map((entry) => entry.id),
            meta: {},
        } as Tab;
        for (const object of Object.values(objects)) {
            WOS.mockObjectForPreview(WOS.makeORef(object.otype, object.oid), object);
            WOS.updateWaveObject({ oid: object.oid, otype: object.otype, updatetype: "update", obj: object });
        }
        return {
            env: makeMockWaveEnv({ tabId: PreviewTabId, mockWaveObjs: objects }),
            tabAtom: WOS.getWaveObjectAtom<Tab>(`tab:${PreviewTabId}`),
            contents: { tabId: PreviewTabId, renderContent: () => null } as TileLayoutContents,
        };
    }, []);
    useLayoutEffect(() => {
        const previousBlockEnv = BlockService.waveEnv;
        const previousObjectEnv = ObjectService.waveEnv;
        BlockService.waveEnv = preview.env;
        ObjectService.waveEnv = preview.env;
        setServicesReady(true);
        return () => {
            BlockService.waveEnv = previousBlockEnv;
            ObjectService.waveEnv = previousObjectEnv;
        };
    }, [preview.env]);
    return (
        <WaveEnvContext.Provider value={preview.env}>
            <div className="flex h-full min-h-0 w-full flex-1 flex-col">
                <p className="m-0 shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                    Actual Tabs component · mock workspace · no terminal, browser, or execution runtime
                </p>
                <div className="min-h-0 flex-1">
                    {servicesReady && <WidgetTabsLayout tabAtom={preview.tabAtom} contents={preview.contents} />}
                </div>
            </div>
        </WaveEnvContext.Provider>
    );
}
