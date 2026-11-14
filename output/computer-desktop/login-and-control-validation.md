# Login and computer control validation

## Installed changes

- Workspace computer selections, chat identities and control ownership persist across app restarts.
- Passive rendering of a chat in another workspace does not move its grant.
- Repeating the same selection does not invalidate the control generation.
- Return to agent resumes the original assignment instead of rebinding it to the focused workspace.
- Active workspace grants keep the VM alive through thinking pauses. Pending login requests have a bounded idle hold.
- Handback requires a stated task-complete, user-request or human-input reason; turn boundaries are not handback points.
- The secure login card supports private manual entry and exact-origin 1Password CLI items. Policies default to Ask and are scoped to website, account and computer.
- Login policies and vault item references use OS-protected storage. Passwords and cookies are not conversation memory.
- Agent tools pause during private login. Stored-chat aliases keep pending requests reachable after renderer reconnection.

## Passed

- 102 targeted Vitest tests across 15 files.
- MCP package build and sandbox tool contract test.
- Electron build and subsequent main/preload rebuilds; updated local app installed.
- Live agent status succeeded across follow-up turns.
- Live app restart retained agent ownership without re-enabling Computer mode. Guest command returned `access_survived_restart`.
- Viewer Return to agent restored the original assignment.
- The initial secure card showed Ask first and an explicit 1Password-unavailable explanation. Public demo credentials were entered in its password field, outside the chat.

## Not yet verified live

- Successful private demo sign-in, final completion and remembered-session reuse in the final build.
- The final HUD card visibility change (authored stylesheet staged in the local app).
- Real 1Password vault authorization: 1Password is not installed on this Mac; the provider path has automated tests.

The Mac locked before the remaining UI checks could finish. Unlock is required to continue. The persisted VM assignment was left with the agent.

## Other repository checks

The full typecheck currently reports existing errors in `emain/emain-window.ts` (Electron event overloads) and `emain/workflow-store.ts` (unknown workflow-step fields). No login/control files are reported by the final typecheck. `git diff --check` passes.

## Continue after unlock

1. Keep the existing account tabs and browser profile intact. If Chromium needs reopening after the earlier VM idle stop, restore its existing `/home/cua/workspace/.browser` session rather than replacing the profile.
2. Use a separate chat and only the public demo origin `https://the-internet.herokuapp.com` for authentication testing.
3. Request `sandbox_vm_login`, complete private sign-in in the visible card, remember Ask first, and return to the agent.
4. Verify the signed-in demo page. Repeat with Automatic for the demo account and confirm session reuse without exposing cookies or passwords.
5. Exercise explicit handback and viewer Return to agent, then verify guest input and ownership again.
6. Leave the original workspace assignment with the agent for the user's ongoing work.
