// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserPreviewStatus } from "@/app/view/webview/browser-preview-chrome";
import { BrowserPageToolbar, WebViewModel } from "@/app/view/webview/webview";
import { useState } from "react";
import { makeMockNodeModel } from "../mock/mock-node-model";
import { makeMockWaveEnv } from "../mock/mockwaveenv";

const BlockId = "browser-chrome-preview";
const ExampleUrl = "https://example.com/";

export function BrowserPreview() {
    const [model] = useState(
        () =>
            new WebViewModel({
                blockId: BlockId,
                nodeModel: makeMockNodeModel({ nodeId: BlockId, blockId: BlockId }),
                tabModel: null,
                waveEnv: makeMockWaveEnv({
                    mockWaveObjs: {
                        [`block:${BlockId}`]: {
                            otype: "block",
                            oid: BlockId,
                            version: 1,
                            meta: { view: "web", "web:chrome": "preview", url: ExampleUrl } as MetaType,
                        },
                    },
                }),
            })
    );

    return (
        <div className="flex h-[min(660px,80vh)] w-[min(1040px,calc(100%-24px))] flex-col overflow-hidden rounded-lg border border-border">
            <BrowserPageToolbar model={model} />
            <div className="webview-shell" data-browser-preview="true">
                <div className="webview-stage">
                    <div className="grid h-full place-content-center bg-[#f0f0f2] p-8 text-[#242429]">
                        <article className="max-w-lg rounded-lg bg-white p-8">
                            <h1 className="mb-4 text-3xl font-semibold">Example Domain</h1>
                            <p>This domain is for use in documentation examples without needing permission.</p>
                        </article>
                    </div>
                </div>
                <BrowserPreviewStatus url={ExampleUrl} state="Ready" zoom={1} />
            </div>
        </div>
    );
}
