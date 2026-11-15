// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Dialog, DialogContent, DialogTitle } from "@hermes/components/ui/dialog";
import { setCronFocusJobId } from "@hermes/store/cron";
import { useContributions } from "@hermes/contrib";
import { lazy, Suspense, useEffect, useState } from "react";
import { setStatusbarItemGroup } from "./panes";

const SkillsView = lazy(async () => ({ default: (await import("../skills")).SkillsView }));
const MessagingView = lazy(async () => ({ default: (await import("../messaging")).MessagingView }));
const ArtifactsView = lazy(async () => ({ default: (await import("../artifacts")).ArtifactsView }));
const WorkflowsView = lazy(async () => ({ default: (await import("../workflows")).WorkflowsView }));
const CronView = lazy(async () => ({ default: (await import("../cron")).CronView }));

const Tools = {
    skills: "Capabilities",
    messaging: "Messaging",
    artifacts: "Artifacts",
    workflows: "Workflows",
    cron: "Scheduled jobs",
    bots: "Bot mode",
    rooms: "Project rooms",
} as const;

export const PenHistoryToolEvent = "kronos:pen-history-tool";

export function PenHistoryTools({ onOpenSession }: { onOpenSession: (id: string) => void }) {
    const [tool, setTool] = useState<keyof typeof Tools>();
    const panes = useContributions("panes");
    const close = () => setTool(undefined);

    useEffect(() => {
        const open = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            const id = typeof detail === "string" ? detail : detail?.tool;
            if (id === "cron" && typeof detail?.jobId === "string") setCronFocusJobId(detail.jobId);
            if (typeof id === "string" && Object.hasOwn(Tools, id)) setTool(id as keyof typeof Tools);
        };
        window.addEventListener(PenHistoryToolEvent, open);
        return () => window.removeEventListener(PenHistoryToolEvent, open);
    }, []);

    if (!tool) return null;
    const paneId = tool === "bots" ? "kronterm-bots:workspace" : "kronterm-bots:project-rooms";
    const content = {
        skills: () => <SkillsView setStatusbarItemGroup={setStatusbarItemGroup} />,
        messaging: () => <MessagingView setStatusbarItemGroup={setStatusbarItemGroup} />,
        artifacts: () => <ArtifactsView setStatusbarItemGroup={setStatusbarItemGroup} />,
        workflows: () => <WorkflowsView />,
        cron: () => <CronView onClose={close} onOpenSession={onOpenSession} />,
        bots: () => panes.find(({ id }) => id === paneId)?.render?.(),
        rooms: () => panes.find(({ id }) => id === paneId)?.render?.(),
    }[tool];

    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent
                data-hermes-app=""
                className="h-[min(720px,85vh)] max-w-[min(920px,92vw)]"
                bodyClassName="flex h-full min-h-0 flex-col"
                aria-describedby={undefined}
            >
                <DialogTitle>{Tools[tool]}</DialogTitle>
                <div className="min-h-0 flex-1 overflow-auto">
                    <Suspense fallback={<p role="status">Loading…</p>}>
                        {content() ?? <p role="status">This workspace tool is unavailable.</p>}
                    </Suspense>
                </div>
            </DialogContent>
        </Dialog>
    );
}
