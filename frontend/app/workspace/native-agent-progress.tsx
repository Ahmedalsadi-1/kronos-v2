// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import type { TermViewModel } from "@/app/view/term/term-model";
import { getBlockComponentModel } from "@/store/global";
import { CheckCircle2, Circle, PauseCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
    isAgentActivityActive,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "../../types/agent-activity";
import { terminalAgentBackend } from "../../types/native-notch";

export function NativeAgentProgress({ blockId }: { blockId: string }) {
    const [backend, setBackend] = useState("");
    const [steps, setSteps] = useState<LiveAgentSurfaceActivity[]>([]);
    useEffect(() => {
        const lookup = () => {
            const model = getBlockComponentModel(blockId)?.viewModel as TermViewModel;
            const term = model?.termRef?.current;
            setBackend(
                term && globalStore.get(term.shellIntegrationStatusAtom) === "running-command"
                    ? (terminalAgentBackend(globalStore.get(term.lastCommandAtom)) ?? "")
                    : ""
            );
        };
        const timer = window.setInterval(lookup, 1000);
        const off = subscribeAgentActivityStream((activity) => {
            if (activity.blockid !== blockId) return;
            setSteps((rows) => [...rows.filter((row) => row.id !== activity.id || !activity.id), activity].slice(-3));
        });
        return () => {
            clearInterval(timer);
            off();
        };
    }, [blockId]);
    if (!backend && !steps.length) return null;
    const active = steps.length ? isAgentActivityActive(steps[steps.length - 1].phase) : Boolean(backend);
    return (
        <aside
            aria-label="Agent task progress"
            className="mr-28 flex shrink-0 items-center gap-4 border-b border-white/10 bg-[#141416] px-4 py-3"
        >
            <div aria-hidden="true" className={`native-agent-face ${active ? "is-working" : ""}`}>
                <i />
                <i />
                <span>•••</span>
            </div>
            <div className="min-w-0 flex-1 text-xs">
                <p className="mb-2 font-medium capitalize text-violet-200">
                    {backend === "opencode" ? "OpenCode" : backend || "Agent activity"}
                </p>
                {steps.length ? (
                    steps.map((step, index) => {
                        const complete = ["succeeded", "finish"].includes(step.phase);
                        const waiting = ["paused", "awaiting-approval"].includes(step.phase);
                        const Icon = complete ? CheckCircle2 : waiting ? PauseCircle : Circle;
                        return (
                            <div
                                key={`${step.timestamp}:${index}`}
                                className="mb-1 flex items-center gap-2 text-white/65"
                            >
                                <Icon size={12} className={complete ? "text-green-400" : "text-violet-300"} />
                                <span className="truncate">{step.detail ?? step.action}</span>
                            </div>
                        );
                    })
                ) : (
                    <p className="text-white/60">Working in terminal…</p>
                )}
            </div>
        </aside>
    );
}
