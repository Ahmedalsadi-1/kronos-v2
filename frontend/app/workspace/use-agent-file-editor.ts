// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getAllBlockComponentModels } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import type { PreviewModel } from "@/app/view/preview/preview-model";
import { createBlock, getApi } from "@/store/global";
import { agentActivityTimeline, isAgentActivityActive, subscribeAgentActivityStream } from "@/types/agent-activity";
import { resolveAgentFilePath } from "@/types/agent-file-activity";
import { useEffect } from "react";
import { kronTermHudController } from "./kronterm-hud-controller";
import { launchKronTermHudIsland } from "./kronterm-hud-islands";

export function useAgentFileEditor() {
    useEffect(() => {
        let opening = false;
        let openedRun: string;
        return subscribeAgentActivityStream((activity) => {
            if (
                opening ||
                document.visibilityState === "hidden" ||
                activity.surface !== "file" ||
                !["running", "succeeded"].includes(activity.phase) ||
                !activity.filepath?.startsWith("/")
            )
                return;
            const existing = getAllBlockComponentModels().some(({ viewModel }) => {
                const model = viewModel as PreviewModel;
                if (model?.viewType !== "preview" || globalStore.get(model.connectionImmediate)) return false;
                const path = globalStore.get(model.metaFilePath);
                if (!path) return false;
                const info = model.loadableFileInfo ? globalStore.get(model.loadableFileInfo) : undefined;
                const root =
                    info?.state === "hasData"
                        ? info.data?.isdir
                            ? info.data.path === "~" && info.data.dir && info.data.name
                                ? `${info.data.dir.replace(/\/$/, "")}/${info.data.name}`
                                : info.data.path
                            : info.data?.dir
                        : path.slice(0, path.lastIndexOf("/")) || "/";
                return resolveAgentFilePath(activity.filepath, root) != null;
            });
            if (existing) return;
            const run = activity.runid ?? activity.sessionid ?? activity.source;
            if (openedRun === run) return;
            opening = true;
            const task = kronTermHudController.getSnapshot().active
                ? launchKronTermHudIsland("files", { file: activity.filepath })
                : createBlock({ meta: { view: "preview", file: activity.filepath, edit: true } });
            void task
                .then((blockId) => {
                    openedRun = run;
                    const latest =
                        agentActivityTimeline
                            .getAll()
                            .filter((event) => event.filepath === activity.filepath && event.runid === activity.runid)
                            .at(-1) ?? activity;
                    // A newly opened native renderer missed the event that created its editor.
                    getApi().setDesktopPetActivity?.({
                        kind: isAgentActivityActive(latest.phase) ? "tool" : "idle",
                        detail: latest.detail ?? latest.action,
                        surfaceActivity: { ...latest, blockid: blockId },
                    });
                })
                .catch((error) => console.error("Could not open the agent file editor", error))
                .finally(() => {
                    opening = false;
                });
        });
    }, []);
}
