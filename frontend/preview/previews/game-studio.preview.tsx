// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { DefaultGameProject } from "@/app/view/gamestudio/game-project";
import { GameStudio, type GameStudioModel } from "@/app/view/gamestudio/game-studio";
import { atom } from "jotai";
import { useMemo } from "react";

export function GameStudioPreview() {
    const model = useMemo(() => {
        const status = atom("");
        return {
            project: atom({ ...DefaultGameProject }),
            status,
            busy: atom(false),
            save: async () => globalStore.set(status, "Appearance preview: persistence requires the desktop widget."),
        } as GameStudioModel;
    }, []);
    return (
        <div className="flex h-full flex-col">
            <div className="bg-amber-950 px-4 py-2 text-sm text-amber-100">
                Appearance preview — game runtime and HTML export are functional; project persistence requires Electron.
            </div>
            <div className="min-h-0 flex-1"><GameStudio model={model} /></div>
        </div>
    );
}
