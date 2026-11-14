// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { OSResourceDragMimeType } from "@/app/store/os-resource-service";
import { MediaLibraryViewModel } from "@/app/view/medialibrary/media-library";
import { Provider } from "jotai";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { normalizeVideoProject } from "./video-project";
import { VideoStudioView, VideoStudioViewModel } from "./video-studio";

vi.mock("@/store/global", async () => {
    const { atom } = await import("jotai");
    return {
        WOS: { getWaveObjectAtom: () => atom(null), makeORef: (type, id) => `${type}:${id}` },
        getApi: vi.fn(),
        createBlock: vi.fn(),
    };
});
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/app/view/hermes/hermes-surface-controller", () => ({ hermesSurfaceController: {} }));
vi.mock("@hermes/store/composer", () => ({ mainComposerScope: {} }));
vi.mock("@/app/workspace/coucou-workbench-appearance", () => ({ useCoucouWorkbenchAppearance: () => ({}) }));
vi.mock("@/app/aipanel/ai-utils", () => ({ formatFileSize: () => "" }));
vi.mock("@/util/endpoints", () => ({ getWebServerEndpoint: () => "http://127.0.0.1:1234" }));

const source = "/assets/clip #1.MOV";

function dropAsset(target: Element, path: string, kind = "file") {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
        value: {
            types: [OSResourceDragMimeType],
            getData: () => JSON.stringify({ id: path, kind, name: "clip", resource: path }),
        },
    });
    target.dispatchEvent(event);
    return event;
}

describe("video source handoff", () => {
    it("opens a populated Video Studio widget in the Media Library's owning tab", async () => {
        const CreateBlockCommand = vi.fn(async () => "block:video");
        const model = new MediaLibraryViewModel({
            blockId: "library",
            tabModel: { tabId: "asset-tab" },
            waveEnv: { rpc: { CreateBlockCommand } },
        } as unknown as ViewModelInitType);
        await model.openInVideoStudio({ path: "/assets/still.png" });
        await model.openInVideoStudio({ path: source });
        expect(CreateBlockCommand).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            tabid: "asset-tab",
            focused: true,
            blockdef: { meta: { view: "videostudio", "videostudio:project": normalizeVideoProject({ source }) } },
        });
    });

    it("imports a dropped asset and waits for confirmation before replacing a project", async () => {
        const SetMetaCommand = vi.fn(async () => {});
        const model = new VideoStudioViewModel({
            blockId: "video",
            waveEnv: { rpc: { SetMetaCommand } },
        } as unknown as ViewModelInitType);
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        try {
            await act(async () => {
                root.render(
                    <Provider store={globalStore}>
                        <VideoStudioView
                            model={model}
                            blockId="video"
                            blockRef={createRef()}
                            contentRef={createRef()}
                        />
                    </Provider>
                );
            });
            const studio = container.querySelector("section");
            await act(async () => {
                expect(dropAsset(studio, source).defaultPrevented).toBe(true);
            });
            expect(globalStore.get(model.project).source).toBe(source);
            expect(container.querySelector("video")?.src).toContain("clip%20%231.MOV");
            const existing = normalizeVideoProject({
                source,
                duration: 10,
                trimStart: 1,
                trimEnd: 9,
                captions: [{ id: "first", start: 2, end: 3, text: "Keep this edit" }],
            });
            await act(async () => {
                model.updateProject(existing);
            });
            const clickButton = (name: string) => {
                const button = Array.from(container.querySelectorAll("button")).find(
                    (entry) => entry.textContent === name
                );
                expect(button).toBeDefined();
                button.click();
            };
            await act(async () => {
                dropAsset(studio, "/assets/next.mp4");
            });
            expect(document.activeElement.textContent).toBe("Keep current video");
            expect(globalStore.get(model.project)).toEqual(existing);
            await act(async () => {
                clickButton("Keep current video");
            });
            expect(globalStore.get(model.project)).toEqual(existing);
            await act(async () => {
                dropAsset(studio, "https://host/next.mp4", "url");
            });
            expect(container.querySelector('[role="alert"]')?.textContent).toContain("Choose a local");
            await act(async () => {
                dropAsset(studio, source);
            });
            expect(globalStore.get(model.project)).toEqual(existing);
            await act(async () => {
                dropAsset(studio, "/assets/next.mp4");
            });
            await act(async () => {
                clickButton("Replace video");
            });
            expect(globalStore.get(model.project)).toEqual(normalizeVideoProject({ source: "/assets/next.mp4" }));
            expect(SetMetaCommand).toHaveBeenCalledTimes(3);
        } finally {
            await act(async () => root.unmount());
            container.remove();
            vi.unstubAllGlobals();
        }
    });
});
