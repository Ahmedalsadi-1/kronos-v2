# Project rooms

Open **Bot mode > Project rooms**, enter a project name and an existing absolute
folder, and choose **Create project room**. The room creates Researcher, Builder,
and Reviewer using the configured default model. Builder receives plain messages;
use mentions to address another teammate. The room's member controls, shared
instructions, approvals, Stop, file links, and conversation history reuse the
bundled OpenMausBot UI and runtime.

The same canonical folder reopens its existing room. Partially completed setup is
reconciled on retry, including when a creation response was lost after saving.
Existing room instructions and model settings are preserved on reopen.

## Execution contract

- The Electron utility process owns execution. Closing, switching, or reloading
  the pane does not cancel work or resubmit a message.
- Room messages and assignments use the existing persistent message store and
  runtime database. The existing coordinator runs real `coordinate_bots`
  handoffs and returns results to the originating conversation.
- Failed provider turns and failed teammates remain visible in the conversation.
  The runtime owns cancellation and waiting-for-user states; the renderer does
  not treat a timeout as a silent pass.
- After a process restart, the bundled coordinator reconciles assignments. It can
  resume a cut turn once with instructions to inspect effects already performed;
  it does not rerun a turn already recorded as having acted outward. A second cut
  becomes a visible failure. This is recovery, not an exactly-once guarantee for
  arbitrary external side effects. Room reopening alone never replays execution.
- Shared outputs use the room's working folder and existing message-scoped file
  routes. File links can be downloaded from the conversation.
- **Shared desktop** opens one terminal, file view, and browser for the room.
  All three teammates resolve to that same durable workspace. Creating or listing
  rooms does not eagerly provision three desktops. Existing non-project bot
  desktops retain their behavior.
- Agents retain tool approvals. Peer routing is limited to their project teammates
  by default. The shared desktop grants browser, terminal, and file tools; it does
  not grant native computer or VM control.

The first release uses the existing managed OpenMausBot-backed agents. It does not
migrate existing Hermes profile group chats into this runtime. Project rooms are
available beside those conversations in Bot Mode. The default room scheduler is
serial; custom configurations enabling parallel room jobs should avoid concurrent
edits to the same resource. Resource-level edit leases are not added here.

## Verification

The new isolated fixture in
`integrations/openmausbot/upstream/server/kronterm/project-room.e2e.test.ts`
creates the actual project team through its HTTP API, dispatches Researcher and
Reviewer through the injected coordination tools, verifies the shared file and
persisted handoffs, reopens the room, and injects a visible reviewer failure.
Its model responses are scripted; this verifies integration and runtime behavior,
not the planning quality of a live model.

Additional checks cover partial setup recovery, duplicate concurrent creation,
canonical folder identity, retained room instructions, shared desktop identity,
renderer reconnects, and existing restart/cancellation behavior. The built room
was also inspected in a browser against a disposable fixture.

## Tool audit follow-up

The initial November 9 audit excerpt contained only passing results. A concrete
issue was nevertheless found in the reported empty shared-skill catalog:
the in-process MCP server initialized it
before the desktop supplied skill roots. The desktop now installs a catalog from
the same resolver used by the managed Hermes runtime. A regression test exercises
both `shared_skill_list` and `shared_skill_read` after late configuration.

The complete audit was subsequently supplied. See
[tool audit fixes](tool-audit-fixes-2026-11-09.md) for terminal, clipboard, file,
workflow context, and OS presentation follow-up and verification limits.
