// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useTabModel } from "@/app/store/tab-model";
import { useWaveEnv } from "@/app/waveenv/waveenv";
import { useDragDropManager } from "react-dnd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    waveEnv: { marker: "native-island-wave-env" },
}));

vi.mock("@/app/waveenv/waveenvimpl", () => ({
    makeWaveEnvImpl: () => mocks.waveEnv,
}));

vi.mock("@/app/block/block", () => ({ Block: () => null }));
vi.mock("@/app/block/blockutil", () => ({
    blockViewToName: () => "Widget",
    resolveBlockIcon: () => "square",
}));
vi.mock("@/app/components/app-icon", () => ({ AppIcon: () => null }));
vi.mock("@/store/global", () => ({
    getApi: () => ({ closeNativeHudSurface: vi.fn() }),
}));

import { NativeIslandProviders } from "./native-island-app";

function ProviderProbe() {
    const waveEnv = useWaveEnv() as unknown as { marker: string };
    const tabModel = useTabModel();
    const manager = useDragDropManager();
    expect(manager.getMonitor()).toBeDefined();
    return <span>{`${waveEnv.marker}:${tabModel.tabId}`}</span>;
}

describe("native island provider stack", () => {
    it("supplies the Wave and tab contexts required by a live BlockView", () => {
        const markup = renderToStaticMarkup(
            <NativeIslandProviders tabId="tab-1">
                <ProviderProbe />
            </NativeIslandProviders>
        );

        expect(markup).toContain("native-island-wave-env:tab-1");
    });
});
