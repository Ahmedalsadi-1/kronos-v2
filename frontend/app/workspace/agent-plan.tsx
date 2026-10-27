// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    agentActivityTimeline,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "@/types/agent-activity";
import { $activeSessionId } from "@hermes/store/session";
import { $todosBySession } from "@hermes/store/todos";
import { useStore } from "@nanostores/react";
import { Check, ChevronDown, Circle, ListChecks, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { activityToPlan, type AgentPlanTask } from "./agent-plan-model";

function PlanRows({ tasks }: { tasks: AgentPlanTask[] }) {
    return (
        <ul className="space-y-1">
            {tasks.map((task) => {
                const Icon =
                    task.status === "done"
                        ? Check
                        : task.status === "failed"
                          ? X
                          : task.status === "running"
                            ? LoaderCircle
                            : Circle;
                return (
                    <li key={task.id}>
                        <div className="flex min-h-8 items-start gap-2 py-1.5 text-xs" data-task-status={task.status}>
                            <Icon
                                aria-hidden="true"
                                size={14}
                                className={`mt-0.5 shrink-0 ${task.status === "running" ? "motion-safe:animate-spin" : ""}`}
                            />
                            <span className="min-w-0 flex-1 break-words">{task.label}</span>
                            <span className="shrink-0 text-[11px] opacity-65">{task.status}</span>
                        </div>
                        {task.children.length > 0 && (
                            <div className="ml-1.5 border-l border-current/15 pl-3">
                                <PlanRows tasks={task.children} />
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export function AgentPlan({ blockIds }: { blockIds: string[] }) {
    const sessionId = useStore($activeSessionId);
    const todosBySession = useStore($todosBySession);
    const todos = todosBySession[sessionId] ?? [];
    const [events, setEvents] = useState<LiveAgentSurfaceActivity[]>(() => agentActivityTimeline.getAll().slice(-120));
    useEffect(
        () =>
            subscribeAgentActivityStream((event) => {
                setEvents((previous) => [...previous, event].slice(-120));
            }),
        []
    );
    const scoped = events.filter((event) => event.blockid && blockIds.includes(event.blockid));
    const currentRun = scoped.at(-1)?.runid;
    const tasks: AgentPlanTask[] = todos.length
        ? todos.map((todo) => ({
              id: todo.id,
              label: todo.content,
              status:
                  todo.status === "completed"
                      ? "done"
                      : todo.status === "in_progress"
                        ? "running"
                        : todo.status === "cancelled"
                          ? "failed"
                          : "pending",
              children: [],
          }))
        : activityToPlan(scoped.filter((event) => event.runid === currentRun));
    return (
        <details className="os-agent-plan" open aria-label="Agent plan checklist">
            <summary className="flex min-h-9 cursor-pointer items-center gap-2 px-3 text-xs font-medium">
                <ListChecks size={15} aria-hidden="true" />
                <span className="flex-1">Agent plan</span>
                <ChevronDown size={13} aria-hidden="true" />
            </summary>
            <div className="max-h-72 overflow-y-auto border-t border-current/10 px-3 py-2">
                {tasks.length ? (
                    <PlanRows tasks={tasks} />
                ) : (
                    <p className="py-2 text-xs opacity-65">Agent steps will appear here when work begins.</p>
                )}
            </div>
        </details>
    );
}
