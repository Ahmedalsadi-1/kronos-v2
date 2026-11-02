// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BlockNodeModel } from "@/app/block/blocktypes";
import { SystemUIProvider } from "@/app/components/system-ui";
import { uxCloseBlock } from "@/app/store/keymodel";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WOS } from "@/store/global";
import { atom, useAtomValue, type Atom } from "jotai";
import { useEffect, useState } from "react";
import { LinuxVmsPanel, type MachineSection } from "./linux-vms";
import { MachinePicker } from "./machine-picker";

export class LinuxVmsViewModel implements ViewModel {
    viewType = "linux-vms";
    viewIcon = atom("desktop");
    blockAtom: Atom<Block>;
    viewName: Atom<string>;
    noPadding = atom(true);
    blockId: string;
    nodeModel: BlockNodeModel;

    constructor({ blockId, nodeModel }: ViewModelInitType) {
        this.blockId = blockId;
        this.nodeModel = nodeModel;
        this.blockAtom = WOS.getWaveObjectAtom<Block>(`block:${blockId}`);
        this.viewName = atom((get) => {
            const kind = get(this.blockAtom)?.meta?.["machine:kind"];
            return kind == "macos"
                ? "macOS VM (Labs)"
                : kind == "android"
                  ? "Android"
                  : kind == "iphone"
                    ? "iPhone"
                    : "Computer";
        });
    }

    get viewComponent(): ViewComponent {
        return LinuxVmsView;
    }
}

export function LinuxVmsView({ model, contentRef }: ViewComponentProps<LinuxVmsViewModel>) {
    const block = useAtomValue(model.blockAtom);
    const kind = block?.meta?.["machine:kind"];
    const section: MachineSection = kind == "macos" || kind == "android" || kind == "iphone" ? kind : "desktop";
    const [settings, setSettings] = useState(Boolean(block?.meta?.["machine:settings"]));
    useEffect(() => setSettings(Boolean(block?.meta?.["machine:settings"])), [block?.meta?.["machine:settings"]]);
    useEffect(() => {
        const showSettings = (event: CustomEvent<{ blockId: string }>) => {
            if (event.detail?.blockId == model.blockId) setSettings(true);
        };
        window.addEventListener("kronterm:machine-settings", showSettings);
        return () => window.removeEventListener("kronterm:machine-settings", showSettings);
    }, [model.blockId]);
    return (
        <SystemUIProvider>
            <div
                ref={contentRef}
                className="kt-system-ui"
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
                {settings && (
                    <button className="cursor-pointer px-3 py-2 text-xs" onClick={() => setSettings(false)}>
                        Done
                    </button>
                )}
                {block?.meta?.["machine:picker"] ? (
                    <MachinePicker
                        onChoose={(kind, id) => {
                            void RpcApi.SetMetaCommand(TabRpcClient, {
                                oref: `block:${model.blockId}`,
                                meta: {
                                    "machine:kind": kind,
                                    "machine:target": id,
                                    "machine:picker": false,
                                } as MetaType,
                            });
                        }}
                    />
                ) : (
                    <LinuxVmsPanel
                        blockId={model.blockId}
                        onCloseWidget={() => uxCloseBlock(model.blockId, () => model.nodeModel?.onClose())}
                        initialSection={section}
                        settings={settings}
                        targetId={block?.meta?.["machine:target"] as string}
                    />
                )}
            </div>
        </SystemUIProvider>
    );
}
