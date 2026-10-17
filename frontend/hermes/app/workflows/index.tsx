// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createCronJob } from "@hermes/hermes";
import { $selectedStoredSessionId } from "@hermes/store/session";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type {
    WorkflowCommand,
    WorkflowDefinition,
    WorkflowKind,
    WorkflowRun,
    WorkflowSnapshot,
    WorkflowTarget,
} from "../../../types/workflow";

import { SavedWorkflowEditor, WorkflowStepsEditor } from "./saved-workflow-editor";

const ButtonClass =
    "cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2";
const InputClass = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm";

export function WorkflowsView({ api: overrideApi }: { api?: ElectronApi } = {}) {
    const navigate = useNavigate();
    const [snapshot, setSnapshot] = useState<WorkflowSnapshot>({ runs: [], workflows: [] });
    const [target, setTarget] = useState<WorkflowTarget>();
    const [blocks, setBlocks] = useState<any[]>([]);
    const [kind, setKind] = useState<WorkflowKind>("browser-code");
    const [customSteps, setCustomSteps] = useState<WorkflowDefinition["steps"]>();
    const [task, setTask] = useState("");
    const [repository, setRepository] = useState("");
    const [computerId, setComputerId] = useState("");
    const [environment, setEnvironment] = useState<WorkflowTarget["environment"]>("workspace");
    const [blockIds, setBlockIds] = useState<string[]>([]);
    const [schedule, setSchedule] = useState("every day at 09:00");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const api = overrideApi ?? (window as unknown as { api: ElectronApi }).api;
    useEffect(() => {
        if (!api?.workflowCommand) {
            setError("Workflows require the KronTerm desktop runtime.");
            return;
        }
        let alive = true;
        const off = api.onWorkflowChanged((value) => {
            if (alive) setSnapshot(value);
        });
        Promise.all([api.workflowCommand({ action: "list" }), api.workflowContext()])
            .then(([value, context]) => {
                if (!alive) return;
                setSnapshot(value as WorkflowSnapshot);
                setTarget({
                    workspaceId: context.workspaceId,
                    tabId: context.tabId,
                    blockIds: [],
                    environment: "workspace",
                });
                setBlocks(context.blocks);
                if (context.blockId && context.blocks.some((block) => (block.blockid ?? block.oid) === context.blockId))
                    setBlockIds([context.blockId]);
            })
            .catch((error) => {
                if (alive) setError(String(error));
            });
        return () => {
            alive = false;
            off();
        };
    }, [api]);
    const perform = async (command: WorkflowCommand) => {
        setBusy(true);
        setError("");
        try {
            await api.workflowCommand(command);
            setSnapshot((await api.workflowCommand({ action: "list" })) as WorkflowSnapshot);
            return true;
        } catch (error) {
            setError(String(error));
            return false;
        } finally {
            setBusy(false);
        }
    };
    const conversationId = useStore($selectedStoredSessionId);
    const create = () =>
        perform({
            action: "create",
            title: task.slice(0, 120),
            kind,
            conversationId,
            target: {
                ...target,
                blockIds,
                environment: kind === "computer-vm" ? environment : "workspace",
                repository: repository || undefined,
                computerId: computerId || undefined,
            },
            parameters: { task },
            steps: customSteps,
        });
    const scheduleWorkflow = async (workflowId: string, title: string) => {
        setBusy(true);
        setError("");
        try {
            await createCronJob({
                name: title,
                deliver: "local",
                schedule,
                prompt: `Run the saved KronTerm workflow ${workflowId} locally. Call workflow_run with action instantiate, workflowId ${workflowId}, conversationId set to this cron run's session ID, and scheduled true. Inspect workflow_runs for progress and return its result. Do not create duplicate catch-up runs or change its target scope. If KronTerm is unavailable, report blocked.`,
            });
            navigate("/cron");
        } catch (error) {
            setError(String(error));
        } finally {
            setBusy(false);
        }
    };
    return (
        <main className="h-full overflow-y-auto bg-background p-5 text-foreground" aria-label="Workflows">
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
                <header className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-medium">Workflows</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            One task, across your workspace. Runs stay on their assigned targets.
                        </p>
                    </div>
                    <button className={ButtonClass} onClick={() => navigate("/cron")}>
                        Schedules
                    </button>
                </header>
                {error && (
                    <p role="alert" className="rounded-lg border border-red-400/30 p-3 text-sm text-red-300">
                        {error}
                    </p>
                )}
                <section
                    className="flex flex-col gap-3 rounded-2xl border border-white/15 p-4"
                    aria-label="New workflow"
                >
                    <label className="text-sm">
                        Workflow
                        <select
                            className={InputClass}
                            value={kind}
                            onChange={(e) => setKind(e.target.value as WorkflowKind)}
                        >
                            <option value="browser-code">Browser → code → verification</option>
                            <option value="computer-vm">Computer / VM task</option>
                            <option value="automation">Reusable automation</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        Task
                        <textarea
                            className={InputClass}
                            rows={3}
                            value={task}
                            onChange={(e) => setTask(e.target.value)}
                            placeholder="Describe the result and how it should be verified"
                        />
                    </label>
                    <p className="text-xs text-muted-foreground">
                        Workspace: {target?.workspaceId ?? "Loading"} · Tab: {target?.tabId ?? "Loading"}
                    </p>
                    <fieldset className="flex flex-wrap gap-2">
                        <legend className="mb-2 text-sm">Assigned widgets</legend>
                        {blocks.map((block) => {
                            const id = block.blockid ?? block.oid;
                            return (
                                <label key={id} className="flex cursor-pointer items-center gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={blockIds.includes(id)}
                                        onChange={(e) =>
                                            setBlockIds(
                                                e.target.checked
                                                    ? [...blockIds, id]
                                                    : blockIds.filter((value) => value !== id)
                                            )
                                        }
                                    />
                                    {block.meta?.["display:name"] ?? block.view ?? id}
                                </label>
                            );
                        })}
                    </fieldset>
                    <label className="text-sm">
                        Repository {kind !== "browser-code" && "(optional)"}
                        <input
                            className={InputClass}
                            value={repository}
                            onChange={(e) => setRepository(e.target.value)}
                            placeholder="Absolute repository path; edits use a separate worktree"
                        />
                    </label>
                    {kind === "computer-vm" && (
                        <>
                            <label className="text-sm">
                                Environment
                                <select
                                    className={InputClass}
                                    value={environment}
                                    onChange={(e) => setEnvironment(e.target.value as WorkflowTarget["environment"])}
                                >
                                    <option value="workspace">Choose an environment</option>
                                    <option value="native">Native application</option>
                                    <option value="vm">Managed VM</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                Exact application or VM ID
                                <input
                                    className={InputClass}
                                    value={computerId}
                                    onChange={(e) => setComputerId(e.target.value)}
                                />
                            </label>
                        </>
                    )}
                    {!conversationId && (
                        <p className="text-xs text-muted-foreground">
                            Open or create a conversation before starting a workflow.
                        </p>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={customSteps != null}
                            onChange={(event) =>
                                setCustomSteps(
                                    event.target.checked
                                        ? [
                                              {
                                                  id: "step-1",
                                                  title: "Inspect inputs",
                                                  instruction:
                                                      "Inspect the assigned targets and task inputs; report missing prerequisites.",
                                                  dependsOn: [],
                                              },
                                              {
                                                  id: "step-2",
                                                  title: "Execute and verify",
                                                  instruction:
                                                      "Complete the requested task using existing tools and verify outputs with observed evidence.",
                                                  dependsOn: ["step-1"],
                                              },
                                          ]
                                        : undefined
                                )
                            }
                        />
                        Customize steps and dependencies
                    </label>
                    {customSteps && <WorkflowStepsEditor steps={customSteps} onChange={setCustomSteps} />}
                    <button
                        className={ButtonClass}
                        disabled={busy || !target || !task.trim() || !conversationId}
                        onClick={create}
                    >
                        Start workflow
                    </button>
                </section>
                <section className="flex flex-col gap-3" aria-label="Workflow runs">
                    <h2 className="font-medium">Runs</h2>
                    {!snapshot.runs.length && (
                        <p className="text-sm text-muted-foreground">
                            Your task history and verification evidence will appear here.
                        </p>
                    )}
                    {[...snapshot.runs].reverse().map((run) => (
                        <WorkflowRunCard
                            key={run.id}
                            run={run}
                            busy={busy}
                            perform={perform}
                            review={(evidenceId) =>
                                api.workflowCommand({
                                    action: "read-evidence",
                                    runId: run.id,
                                    evidenceId,
                                }) as Promise<string>
                            }
                            open={() => api.workflowOpen(run.id).catch((error) => setError(String(error)))}
                        />
                    ))}
                </section>
                <section className="flex flex-col gap-3" aria-label="Saved workflows">
                    <h2 className="font-medium">Saved workflows</h2>
                    {!!snapshot.workflows.length && (
                        <label className="text-sm">
                            Local schedule
                            <input
                                className={InputClass}
                                value={schedule}
                                onChange={(e) => setSchedule(e.target.value)}
                            />
                        </label>
                    )}
                    {snapshot.workflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 p-3"
                        >
                            <span className="mr-auto text-sm">{workflow.title}</span>
                            <SavedWorkflowEditor workflow={workflow} busy={busy} perform={perform} />
                            <button
                                className={ButtonClass}
                                disabled={busy || !conversationId}
                                onClick={() =>
                                    perform({
                                        action: "instantiate",
                                        workflowId: workflow.id,
                                        conversationId,
                                        parameters: task.trim() ? { task } : undefined,
                                    })
                                }
                            >
                                Run again
                            </button>
                            <button
                                className={ButtonClass}
                                disabled={busy || !schedule.trim()}
                                onClick={() => scheduleWorkflow(workflow.id, workflow.title)}
                            >
                                Schedule
                            </button>
                        </div>
                    ))}
                </section>
            </div>
        </main>
    );
}

export function WorkflowRunCard({
    run,
    busy,
    perform,
    open,
    review,
}: {
    run: WorkflowRun;
    busy: boolean;
    perform: (command: WorkflowCommand) => unknown;
    open: () => unknown;
    review?: (evidenceId: string) => Promise<string>;
}) {
    const [diffs, setDiffs] = useState<Record<string, string>>({});
    const [reviewError, setReviewError] = useState("");
    const loadDiff = async (evidenceId: string) => {
        setReviewError("");
        try {
            const content = await review(evidenceId);
            setDiffs((current) => ({ ...current, [evidenceId]: content || "No tracked changes in this step." }));
        } catch (error) {
            setReviewError(String(error));
        }
    };
    return (
        <article className="flex flex-col gap-3 rounded-2xl border border-white/15 p-4">
            <header className="flex flex-wrap justify-between gap-2">
                <h3 className="font-medium">{run.title}</h3>
                <span className="text-xs text-muted-foreground">{run.status}</span>
            </header>
            <p className="break-all text-xs text-muted-foreground">
                {run.target.environment} · {run.target.computerId ?? run.target.workspaceId}
                {run.workflowVersion != null && ` · Workflow version ${run.workflowVersion}`}
            </p>
            <ol className="flex flex-col gap-2 text-sm">
                {run.steps.map((step) => (
                    <li key={step.id} className="flex justify-between gap-3">
                        <span>{step.title}</span>
                        <span className="text-xs text-muted-foreground">{step.status}</span>
                    </li>
                ))}
            </ol>
            {run.question && (
                <div className="rounded-lg border border-amber-400/30 p-3 text-sm">
                    <p>{run.question.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Inspect the target before deciding whether to retry or mark this step complete.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {run.question.kind === "permission"
                            ? run.question.options?.map((option) => (
                                  <button
                                      key={option.id}
                                      className={ButtonClass}
                                      disabled={busy}
                                      onClick={() =>
                                          perform({
                                              action: "permission",
                                              runId: run.id,
                                              questionId: run.question.id,
                                              optionId: option.id,
                                          })
                                      }
                                  >
                                      {option.kind === "allow_once" ? "Approve once" : "Reject"}
                                  </button>
                              ))
                            : (["retry", "completed"] as const).map((resolution) => (
                                  <button
                                      key={resolution}
                                      className={ButtonClass}
                                      disabled={busy}
                                      onClick={() =>
                                          perform({
                                              action: "reconcile",
                                              runId: run.id,
                                              questionId: run.question.id,
                                              resolution,
                                          })
                                      }
                                  >
                                      {resolution === "retry" ? "Safe to retry" : "Already completed"}
                                  </button>
                              ))}
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <button className={ButtonClass} onClick={open}>
                    Open workspace
                </button>
                {run.status === "running" || run.status === "queued" ? (
                    <button
                        className={ButtonClass}
                        disabled={busy}
                        onClick={() => perform({ action: "pause", runId: run.id })}
                    >
                        Pause / take over
                    </button>
                ) : ["paused", "blocked"].includes(run.status) && !run.question ? (
                    <button
                        className={ButtonClass}
                        disabled={busy}
                        onClick={() => perform({ action: "resume", runId: run.id })}
                    >
                        Resume
                    </button>
                ) : null}
                {!["succeeded", "cancelled"].includes(run.status) && (
                    <button
                        className={ButtonClass}
                        disabled={busy}
                        onClick={() => perform({ action: "cancel", runId: run.id })}
                    >
                        Cancel
                    </button>
                )}
                {run.status === "succeeded" && (
                    <button
                        className={ButtonClass}
                        disabled={busy}
                        onClick={() => perform({ action: "save", runId: run.id })}
                    >
                        Save workflow
                    </button>
                )}
            </div>
            {!!run.checkpoints?.length && !["running", "queued"].includes(run.status) && (
                <details>
                    <summary className="cursor-pointer text-sm">Restore worktree checkpoint</summary>
                    <p className="my-2 text-xs text-muted-foreground">
                        Restoring replaces changes in this run's isolated worktree and resets this step and its
                        successors.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {run.checkpoints.map((checkpoint) => (
                            <button
                                key={checkpoint.id}
                                className={ButtonClass}
                                disabled={busy}
                                onClick={() =>
                                    perform({ action: "restore", runId: run.id, checkpointId: checkpoint.id })
                                }
                            >
                                Before {run.steps.find((step) => step.id === checkpoint.stepId)?.title}
                            </button>
                        ))}
                    </div>
                </details>
            )}
            {!!run.evidence.length && (
                <details>
                    <summary className="cursor-pointer text-sm">
                        Review result · {run.evidence.length} evidence items
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                        {run.evidence.map((item) => (
                            <div key={item.id}>
                                <p className="text-xs font-medium">{item.label}</p>
                                <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                                    {item.value}
                                </pre>
                                {item.label === "Worktree diff" && review && (
                                    <button className={ButtonClass} onClick={() => loadDiff(item.id)}>
                                        Show diff
                                    </button>
                                )}
                                {diffs[item.id] && (
                                    <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-white/5 p-3 text-xs">
                                        {diffs[item.id]}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                    {reviewError && (
                        <p role="alert" className="mt-2 text-sm text-red-400">
                            {reviewError}
                        </p>
                    )}
                </details>
            )}
        </article>
    );
}
