import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { WorkflowRun } from "../frontend/types/workflow";
import { answerWorkflowPermission, requestWorkflowPermission } from "./workflow-permissions";
import { WorkflowStore } from "./workflow-store";
let directory: string;
let journal: WorkflowStore;
let run: WorkflowRun;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-permission-"));
    journal = new WorkflowStore(path.join(directory, "journal.json"));
    run = journal.command({
        action: "create",
        kind: "automation",
        conversationId: "chat",
        parameters: { task: "Verify the result" },
        target: { workspaceId: "workspace", tabId: "tab", blockIds: [], environment: "workspace" },
    }) as WorkflowRun;
    journal.update(run.id, (draft) => {
        draft.status = "running";
        draft.steps[0].status = "running";
    });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const confirmation = {
    callId: "call",
    title: "Write the selected file",
    options: [
        { optionId: "allow", kind: "allow_once" },
        { optionId: "reject", kind: "reject_once" },
        { optionId: "forever", kind: "allow_always" },
    ],
};
test("permission decisions bind to one live run and request and grant only once", async () => {
    const pending = requestWorkflowPermission(journal, run, confirmation, new AbortController().signal);
    const question = journal.get(run.id).question;
    expect(question).toMatchObject({ kind: "permission", callId: "call", stepId: "step-1" });
    expect(question.options.map((option) => option.id)).toEqual(["allow", "reject"]);
    expect(() => answerWorkflowPermission("other", question.id, "allow")).toThrow("stale");
    expect(() => answerWorkflowPermission(run.id, question.id, "forever")).toThrow("stale");
    expect(() =>
        journal.command({ action: "reconcile", runId: run.id, questionId: question.id, resolution: "completed" })
    ).toThrow("permission");
    answerWorkflowPermission(run.id, question.id, "allow");
    expect(await pending).toBe("allow");
    expect(() => answerWorkflowPermission(run.id, question.id, "allow")).toThrow("stale");
    expect(journal.get(run.id).question).toBeUndefined();
});
test("takeover invalidates the approval transport", async () => {
    const controller = new AbortController();
    const pending = requestWorkflowPermission(journal, run, confirmation, controller.signal);
    const question = journal.get(run.id).question;
    const rejected = expect(pending).rejects.toThrow("takeover");
    controller.abort();
    await rejected;
    expect(() => answerWorkflowPermission(run.id, question.id, "allow")).toThrow("stale");
});
