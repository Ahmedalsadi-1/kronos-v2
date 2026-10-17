# Persistent workspace workflows

Open **Workflows** in the Hermes sidebar or Coucou navigation. Create a conversation,
choose a workflow, describe the task, and select its workspace widgets. Browser/code
runs also need an absolute Git repository path. Computer/VM runs need an explicit
application or managed desktop ID and the corresponding execution environment.

The three templates investigate, execute, and verify a browser/code issue, a
computer/VM task, or a reusable automation. Steps use the existing KronosCode ACP
runtime and tools. Missing runtimes, unavailable targets, denied permissions, and
unverified results produce a blocked run with a reason. Completion requires
observed tool activity and the specialist's structured verification report.

Each run retains its conversation ID, original workspace, tab, widget IDs, parameters,
completed steps, pending decisions, and evidence. Viewing another workspace does
not change these targets. Desktop and HUD read the same local journal. Coucou shows
the current step and attention requests, with Open workspace, Pause, Take over,
and Review result controls. Permission requests must be answered by the user in
Workflows; delegated agents cannot approve their own requests.

Code runs use separate Git worktrees. Checkpoints capture modified, staged, deleted,
and new non-ignored files before each step. Review result exposes evidence and the
worktree diff with inline inspection. Restore replaces the isolated worktree's pending contents and
resets the selected step and its successors; it refuses restoration after HEAD
changes. Main checkout contents are preserved. Ignored files are outside checkpoints.

Up to three independent runs execute concurrently. Native computer control has
one shared controller; each VM and each saved workflow also has an exclusive
execution lease. Pause and takeover abort the specialist. An interrupted step is
uncertain: inspect its target, then choose Safe to retry or Already completed before
resuming. Restart keeps completed steps and requires reconciliation of interrupted
external actions. Approvals bind to one live request and cannot be replayed.

Save a successful run to reuse its template, targets, and parameters. Schedule it
through the existing Hermes scheduling page. Scheduled invocations coalesce into
one queued catch-up run per workflow; overlapping executions queue. Execution is
local: the app and Hermes scheduler must be running. Closed-app or sleeping-Mac
runs resume when the app returns. No always-on service is added.

Chat layout events carry revisions independently of expanded intent. Temporary
missing measurements preserve the conversation and draft; after one second the
same renderer appears in floating recovery mode. Valid measurements restore its
rail. Explicit collapse remains collapsed across widget switches and recovery.

Validation covers bridge event ordering and missing measurements, all three
coordinator templates with a mocked provider, real isolated Git worktrees and
checkpoint restoration, restart reconciliation, leases, and trusted desktop/HUD
approval routing. A real provider and real application/VM end-to-end run still
require validation in the running desktop.
