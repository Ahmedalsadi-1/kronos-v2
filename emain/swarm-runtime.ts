// Copyright 2026, KronOS. SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import type { SwarmTarget } from "../frontend/types/swarm";
import { notifyDesktopPetSurfaceActivity } from "./emain-pet";
import { getWaveDataDir } from "./emain-platform";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { runSwarmHermesWorker } from "./swarm-hermes-worker";
import { SwarmService } from "./swarm-service";
import { SwarmWorkerError } from "./swarm-worker-error";

export function makeSwarmRuntime(inventory: (context: HermesSurfaceContext) => Promise<SwarmTarget[]>): SwarmService {
    return new SwarmService({
        journalPath: path.join(getWaveDataDir(), "swarms", "journal.json"),
        inventory,
        publish: notifyDesktopPetSurfaceActivity,
        worker: async (input) => {
            const { HermesRuntime } = await import("./hermes-runtime");
            let connection: Awaited<ReturnType<typeof HermesRuntime.ensure>>;
            try {
                input.signal.throwIfAborted();
                connection = await HermesRuntime.ensure();
                input.signal.throwIfAborted();
            } catch (error) {
                throw new SwarmWorkerError(error instanceof Error ? error.message : "Hermes is unavailable", false);
            }
            return runSwarmHermesWorker({
                connection,
                ...input,
                onEvent: (event) => {
                    if (!["tool.start", "tool.complete"].includes(event.type)) return;
                    const payload = event.payload as { name?: string; preview?: string; tool_preview?: string };
                    input.onTool?.(
                        String(payload?.name ?? "tool"),
                        String(payload?.tool_preview ?? payload?.preview ?? "").slice(0, 2000)
                    );
                },
            });
        },
    });
}
