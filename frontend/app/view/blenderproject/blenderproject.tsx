// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { getApi, WOS } from "@/store/global";
import { atom, useAtom, useAtomValue, type Atom, type PrimitiveAtom } from "jotai";
import { useEffect } from "react";
import { findBlenderApp, validateBlendPath } from "./blenderproject-utils";

export class BlenderProjectModel implements ViewModel {
    viewType = "blenderproject";
    viewName = atom("Blender Project");
    viewIcon = atom("cube");
    noPadding = atom(true);
    viewComponent = BlenderProject;
    blockId: string;
    app = atom(null) as PrimitiveAtom<InstalledAppInfo>;
    loading = atom(false);
    discovered = atom(false);
    error = atom("");
    notice = atom("");
    sceneDraft = atom("");
    blockAtom: Atom<Block>;
    savedScene: Atom<string>;
    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
        this.blockAtom = WOS.getWaveObjectAtom<Block>(`block:${blockId}`);
        this.savedScene = atom((get) => String(get(this.blockAtom)?.meta?.["blender:scene"] ?? ""));
    }
    async discover() {
        if (globalStore.get(this.loading)) return;
        globalStore.set(this.loading, true);
        globalStore.set(this.error, "");
        try {
            const apps = await RpcApi.ListInstalledAppsCommand(TabRpcClient);
            globalStore.set(this.app, findBlenderApp(apps));
            globalStore.set(this.discovered, true);
        } catch (error) {
            globalStore.set(this.error, `Could not inspect installed apps: ${String(error)}`);
        } finally {
            globalStore.set(this.loading, false);
        }
    }
    async saveScene() {
        globalStore.set(this.error, "");
        globalStore.set(this.notice, "");
        globalStore.set(this.loading, true);
        try {
            const scene = validateBlendPath(globalStore.get(this.sceneDraft));
            await RpcApi.SetMetaCommand(TabRpcClient, {
                oref: WOS.makeORef("block", this.blockId),
                meta: { "blender:scene": scene } as MetaType,
            });
            globalStore.set(this.notice, "Scene reference saved to this workspace widget.");
        } catch (error) {
            globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        } finally {
            globalStore.set(this.loading, false);
        }
    }
    native(action: "launch" | "open" | "reveal") {
        globalStore.set(this.error, "");
        try {
            const api = getApi();
            if (action === "launch") {
                const app = globalStore.get(this.app);
                if (!app) throw new Error("Blender was not found. Install it and refresh installed apps.");
                api.openNativePath(app.path || app.execpath);
            } else {
                const scene = validateBlendPath(globalStore.get(this.savedScene));
                if (action === "reveal") api.revealNativePath(scene);
                else api.openNativePath(scene);
            }
            globalStore.set(
                this.notice,
                "Request sent to macOS. Native launch failures are reported by the desktop host."
            );
        } catch (error) {
            globalStore.set(this.error, String(error instanceof Error ? error.message : error));
        }
    }
}

export function BlenderProject({ model }: ViewComponentProps<BlenderProjectModel>) {
    const appearance = useCoucouWorkbenchAppearance();
    const [draft, setDraft] = useAtom(model.sceneDraft);
    const app = useAtomValue(model.app);
    const loading = useAtomValue(model.loading);
    const discovered = useAtomValue(model.discovered);
    const error = useAtomValue(model.error);
    const notice = useAtomValue(model.notice);
    const scene = useAtomValue(model.savedScene);
    useEffect(() => {
        setDraft(globalStore.get(model.savedScene));
        void model.discover();
    }, [model, setDraft]);
    const button = "cursor-pointer rounded border border-[var(--coucou-border)] px-3 py-2 disabled:opacity-40";
    return (
        <section
            style={appearance}
            className="h-full overflow-auto bg-[var(--coucou-surface)] p-5 text-[var(--coucou-label)]"
        >
            <h2 className="text-lg font-semibold">Blender Project</h2>
            <p className="mt-2 text-sm text-[var(--coucou-secondary)]">
                Keep a local scene attached to your workspace. Edit materials, lighting and geometry in Blender.
            </p>
            <div className="my-4 flex flex-wrap items-center gap-3">
                <span>
                    {loading
                        ? "Checking…"
                        : app
                          ? `Installed: ${app.name}`
                          : discovered
                            ? "Blender is not installed"
                            : "Installation has not been checked"}
                </span>
                <button className={button} disabled={loading} onClick={() => void model.discover()}>
                    Refresh installed apps
                </button>
                <button className={button} disabled={!app || loading} onClick={() => model.native("launch")}>
                    Launch Blender
                </button>
            </div>
            {error && (
                <p role="alert" className="my-3 text-sm text-red-400">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="my-3 text-sm">
                    {notice}
                </p>
            )}
            <label htmlFor={`scene-${model.blockId}`} className="block text-sm">
                Local .blend scene path
            </label>
            <input
                id={`scene-${model.blockId}`}
                className="my-2 w-full rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-3"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="~/Projects/MyScene.blend"
            />
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={loading || !draft.trim()} onClick={() => void model.saveScene()}>
                    Save scene reference
                </button>
                <button className={button} disabled={!scene} onClick={() => model.native("open")}>
                    Open in native app
                </button>
                <button className={button} disabled={!scene} onClick={() => model.native("reveal")}>
                    Reveal scene
                </button>
            </div>
            {scene && <p className="mt-4 break-all font-mono text-xs">Attached scene: {scene}</p>}
            <p className="mt-5 text-sm text-[var(--coucou-secondary)]">
                Render and export in Blender, then open the resulting files in KronTerm. This adapter stores a scene
                reference; it does not embed the Blender editor or run background renders.
            </p>
        </section>
    );
}
