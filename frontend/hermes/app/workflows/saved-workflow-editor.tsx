// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { SavedWorkflow, WorkflowCommand, WorkflowDefinition } from "../../../types/workflow";

const InputClass = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
const ButtonClass = "cursor-pointer rounded border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50";

export function WorkflowStepsEditor({
    steps,
    onChange,
}: {
    steps: WorkflowDefinition["steps"];
    onChange: (steps: WorkflowDefinition["steps"]) => void;
}) {
    const update = (index: number, patch: Partial<WorkflowDefinition["steps"][number]>) =>
        onChange(steps.map((step, position) => (position === index ? { ...step, ...patch } : step)));
    return (
        <div className="flex flex-col gap-3">
            {steps.map((step, index) => (
                <fieldset key={step.id} className="flex flex-col gap-2 border-l-2 border-border pl-3">
                    <legend className="text-xs text-muted-foreground">
                        Step {index + 1} · {step.id}
                    </legend>
                    <label className="text-sm">
                        Title
                        <input
                            className={InputClass}
                            value={step.title}
                            maxLength={160}
                            onChange={(event) => update(index, { title: event.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Instructions
                        <textarea
                            className={InputClass}
                            rows={3}
                            value={step.instruction}
                            maxLength={20000}
                            onChange={(event) => update(index, { instruction: event.target.value })}
                        />
                    </label>
                    <fieldset className="flex flex-wrap gap-3">
                        <legend className="text-xs">Wait for</legend>
                        {steps
                            .filter((candidate) => candidate.id !== step.id)
                            .map((candidate) => (
                                <label key={candidate.id} className="flex cursor-pointer items-center gap-1 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={step.dependsOn.includes(candidate.id)}
                                        onChange={(event) =>
                                            update(index, {
                                                dependsOn: event.target.checked
                                                    ? [...step.dependsOn, candidate.id]
                                                    : step.dependsOn.filter((id) => id !== candidate.id),
                                            })
                                        }
                                    />
                                    {candidate.title || candidate.id}
                                </label>
                            ))}
                    </fieldset>
                    <button
                        type="button"
                        className={ButtonClass}
                        disabled={steps.length === 1}
                        onClick={() =>
                            onChange(
                                steps
                                    .filter((entry) => entry.id !== step.id)
                                    .map((entry) => ({
                                        ...entry,
                                        dependsOn: entry.dependsOn.filter((id) => id !== step.id),
                                    }))
                            )
                        }
                    >
                        Remove step
                    </button>
                </fieldset>
            ))}
            <button
                type="button"
                className={ButtonClass}
                disabled={steps.length >= 100}
                onClick={() =>
                    onChange([
                        ...steps,
                        {
                            id: `step-${crypto.randomUUID()}`,
                            title: "",
                            instruction: "",
                            dependsOn: steps.length ? [steps[steps.length - 1].id] : [],
                        },
                    ])
                }
            >
                Add step
            </button>
        </div>
    );
}

export function SavedWorkflowEditor({
    workflow,
    busy,
    perform,
}: {
    workflow: SavedWorkflow;
    busy: boolean;
    perform: (command: WorkflowCommand) => Promise<boolean>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<WorkflowDefinition>();
    const [baseVersion, setBaseVersion] = useState(1);
    const save = async () => {
        if (
            await perform({
                action: "update-workflow",
                workflowId: workflow.id,
                expectedVersion: baseVersion,
                definition: draft,
            })
        )
            setEditing(false);
    };
    return (
        <div className="w-full">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                    Version {workflow.version ?? 1} · {workflow.steps.length} steps
                </span>
                <button
                    className={ButtonClass}
                    disabled={busy}
                    onClick={() => {
                        setBaseVersion(workflow.version ?? 1);
                        setDraft(structuredClone(workflow));
                        setEditing(!editing);
                    }}
                >
                    Edit steps
                </button>
                <details>
                    <summary className="cursor-pointer text-sm">History</summary>
                    <div className="mt-2 flex flex-col gap-2">
                        {!workflow.revisions?.length && (
                            <p className="text-xs text-muted-foreground">No earlier versions.</p>
                        )}
                        {[...(workflow.revisions ?? [])].reverse().map((revision) => (
                            <button
                                className={ButtonClass}
                                key={revision.version}
                                disabled={busy}
                                onClick={() =>
                                    perform({
                                        action: "restore-workflow",
                                        workflowId: workflow.id,
                                        expectedVersion: workflow.version ?? 1,
                                        revision: revision.version,
                                    })
                                }
                            >
                                Restore version {revision.version} · {revision.title}
                            </button>
                        ))}
                    </div>
                </details>
                <button
                    className={ButtonClass}
                    disabled={busy}
                    onClick={() => {
                        if (
                            window.confirm(
                                `Delete saved workflow “${workflow.title}”? Existing run history will remain.`
                            )
                        )
                            void perform({
                                action: "delete-workflow",
                                workflowId: workflow.id,
                                expectedVersion: workflow.version ?? 1,
                            });
                    }}
                >
                    Delete
                </button>
            </div>
            {editing && draft && (
                <section aria-label={`Edit ${workflow.title}`} className="mt-3 flex flex-col gap-3">
                    <label className="text-sm">
                        Name
                        <input
                            className={InputClass}
                            maxLength={160}
                            value={draft.title}
                            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Default task
                        <textarea
                            className={InputClass}
                            rows={2}
                            value={draft.parameters.task}
                            onChange={(event) =>
                                setDraft({ ...draft, parameters: { ...draft.parameters, task: event.target.value } })
                            }
                        />
                    </label>
                    <WorkflowStepsEditor steps={draft.steps} onChange={(steps) => setDraft({ ...draft, steps })} />
                    <p className="text-xs text-muted-foreground">
                        Updates apply to future runs. Assigned widgets and existing runs retain their scope.
                    </p>
                    <div className="flex gap-2">
                        <button className={ButtonClass} disabled={busy} onClick={save}>
                            Save version
                        </button>
                        <button className={ButtonClass} onClick={() => setEditing(false)}>
                            Cancel editing
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
