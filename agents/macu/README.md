# MACU swarms in KronOS

From an attached parent Hermes chat, ask KronOS to split a concrete computer
task across selected targets. MACU proposes a dependency graph. KronOS assigns
one target to each worker and schedules independent work in parallel when the
targets have separate input and session resources.

## Run a swarm

After updating the app, restart KronOS and its managed Hermes runtime to load
the new tools and worker guard. Existing chats can then discover `swarm_*`
through `tool_search`.

1. Use `swarm_targets` to list the ready targets available to this chat. Select
   the IDs for the task.
2. Call `swarm_start` with `goal`, one to eight `targetIds`, and optional
   `concurrency`. Concurrency defaults to two and accepts one to four. Save the
   returned run ID.
3. Call `swarm_status` with the `runId` to inspect the plan revision, worker
   states, and recorded evidence. Omit `runId` to list this chat's runs.
4. Use `swarm_replan` with `runId`, the `expectedRevision` from status, and a
   concrete `reason` to propose changes to pending work. The original target
   grants and started work are fixed.
5. Use `swarm_cancel` with `runId` to stop pending work and revoke active workers.
   Check status for the final outcome. If a worker stopped with an uncertain
   effect, its resources remain quarantined, including after restart. This
   rollout has no automatic retry or user-facing quarantine reset; inspecting
   a target alone does not clear that block.

## Target coverage

- HTTP(S) browser widgets in the current tab support browser tasks. Help,
  system information, and KronOS canvas widgets expose inspection tools.
  Terminal and editor widgets are not swarm targets in this rollout.
- Device and Linux VM targets are Labs features. Select a ready device with
  an existing assignment to this caller, or ready Linux VMs already granted to
  the parent tab. Exclusive Computer mode exposes its selected VM; hybrid
  mode can use multiple already-owned VMs. Running emulator device IDs are
  supported; Android AVD template IDs are excluded. Workers use those existing
  targets. VM cloning and macOS VM orchestration are outside this rollout.
- Targets sharing browser state or tab input serialize. A dependent worker
  starts only after its prerequisites report verified success.

Workers and the planner use the managed Hermes runtime's **default profile**
and its configured model, including when the parent uses a named profile.
Per-profile worker routing is not included in this rollout. The planner has no
surface tools; each worker receives only the tools for its assigned target.
Up to four workers run globally. The Subagents view shows each worker's target,
tool activity, preview, and settled outcome. Stop targets that worker's live
Hermes session; a running tool must settle before its target is released.

Browser checks pin block, tab, workspace, and session partition. Guest and
document generations are not yet tracked. Device and VM calls check their
control generation. Restarted in-flight work is marked uncertain and is never
automatically replayed.

Run status and evidence survive restart in the local journal. The theater is a
live activity view; a full renderer reload does not yet repopulate historical
worker cards. Use `swarm_status` for those runs.

The planner and replanner are adapted from the pinned MACU revision documented
in [SOURCE.md](./SOURCE.md).
