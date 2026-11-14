# November 9 tool audit fixes

These changes address the complete audit supplied after the project-room release.
Existing permission checks, target ownership, and user workspace presentation are
preserved. No audit artifacts or user workflows were deleted or executed.

| Finding                                     | Cause and change                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terminal_input` rejected `controllerinput` | Both Electron and the CLI routed backend shell input to `feblock`. They now use the backend controller route, retaining target ownership checks.                                                                                                                                                                 |
| `widget_clipboard_set` failed               | Preload methods existed without matching main-process IPC handlers. Clipboard reads and writes now have trusted, top-level sender checks and text validation. Clipboard read errors propagate instead of appearing as an empty clipboard.                                                                        |
| Host directory listings appeared empty      | Native `file_list` omitted `opts`; the remote handler dereferenced the nil options and closed its stream after a recovered panic. The native caller supplies options and the backend defaults omitted options. A real temporary-directory regression test verifies nonempty output and missing-directory errors. |
| File reads and metadata were ambiguous      | Missing-file metadata is now an explicit error, directory reads direct callers to `file_list`, and zero-byte files return empty text. Explicit remote URIs remain supported. The audited `/Users/albsheralsadi/website/package.json` was absent during this investigation.                                       |
| n8n said `Open a workspace tab first`       | Workflow calls bypassed the workspace ownership resolution used by widget tools. They now resolve tab-only callers through the existing target resolver before invoking n8n, retaining caller restrictions and cancellation. They do not adopt whichever workspace happens to be visible.                        |
| OS view and overview aliases were unknown   | These actions are implemented by the OS surface, but fell through to the generic layout dispatcher in other presentations. They now report the current presentation and how to switch to OS. Tests cover forwarding in OS and clear rejection elsewhere. No automatic presentation change is introduced.         |

Stale element references, canvas-only actions outside canvas, missing tools, and
the delegation batch guard are not repaired by inventing successful responses.
Use the current catalog and reacquire widget references after navigation.

## Validation

- 83 targeted Electron, renderer, and workflow tests pass, covering routing, ownership,
  clipboard trust checks, missing files, and presentation prerequisites.
- The MCP suite passes 172 tests.
- `npm run check:ts` and `git diff --check` pass.
- `go test ./pkg/wshrpc/wshremote ./cmd/wsh/cmd` passes, including a filesystem
  regression with omitted listing options.
- The running desktop was not restarted, and no live workflow was created or run.
  The changes need the updated Electron bundle; CLI and remote-handler changes
  also need the updated Go binaries. Automated checks are not a repeat of all
  108 tools against a rebuilt desktop session.
