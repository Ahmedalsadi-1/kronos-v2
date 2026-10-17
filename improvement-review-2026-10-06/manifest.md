# 50-agent review manifest

Completed 50 section reports:48 distinct subagents plus two primary-agent reviews after the user requested fewer agents. Focused samples, not exhaustive audits. Only report artifacts were created. See index.md for actual reviewer identities and limitations.

| Review | Section | Paths | Agent | Status |
| --- | --- | --- | --- | --- |
| [01](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/01.md) | Electron startup | `emain/emain.ts` | /root/review_01 | complete |
| [02](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/02.md) | Electron windows | `emain/emain-window.ts` | /root/review_02 | complete |
| [03](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/03.md) | Electron IPC/preload | `emain/emain-ipc.ts emain/preload.ts` | /root/review_03 | complete |
| [04](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/04.md) | Browser isolation | `emain/preload-webview.ts frontend/app/view/webview` | /root/review_01/review_04 | complete |
| [05](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/05.md) | Agent runtime | `emain/kronoscode-runtime.ts` | /root/review_01/review_05 | complete |
| [06](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/06.md) | Hermes runtime | `emain/hermes-runtime.ts` | /root/review_01/review_06 | complete |
| [07](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/07.md) | ACP transport | `emain/acp` | /root/review_01/review_07 | complete |
| [08](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/08.md) | Tool server | `emain/kronterm-tool-server.ts` | /root/review_01/review_08 | complete |
| [09](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/09.md) | Native bridges | `native emain` | /root/review_01/review_09 | complete |
| [10](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/10.md) | Pet/overlays | `desktop-pet frontend/pet emain/emain-pet.ts` | /root/review_01/review_10 | complete |
| [11](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/11.md) | OS shell | `frontend/app/workspace/kronarchy-shell.tsx` | /root/review_01/review_11 | complete |
| [12](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/12.md) | OS state | `frontend/app/tab/os-workspace-model.ts` | /root/review_01/review_12 | complete |
| [13](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/13.md) | HUD | `frontend/app/workspace/kronterm-hud-controller.ts` | /root/review_01/review_13 | complete |
| [14](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/14.md) | Canvas | `frontend/app/tab/workspace-canvas.tsx` | /root/review_01/review_14 | complete |
| [15](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/15.md) | Tabs | `frontend/app/tab/widget-tabs-layout.tsx` | /root/review_01/review_15 | complete |
| [16](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/16.md) | Layout engine | `frontend/layout` | /root/review_01/review_16 | complete |
| [17](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/17.md) | Block lifecycle | `frontend/app/block` | /root/review_01/review_17 | complete |
| [18](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/18.md) | Jotai state | `frontend/app/store` | /root/review_01/review_18 | complete |
| [19](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/19.md) | Keyboard | `frontend/app/store/keymodel.ts frontend/hermes/lib/keybinds` | /root/review_01/review_19 | complete |
| [20](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/20.md) | Command center | `frontend/app/modals/command-palette.tsx` | /root/review_01/review_20 | complete |
| [21](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/21.md) | Terminal renderer | `frontend/app/view/term` | /root/review_01/review_21 | complete |
| [22](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/22.md) | PTY backend | `pkg/shellexec pkg/blockcontroller` | /root/review_01/review_22 | complete |
| [23](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/23.md) | SSH | `pkg/remote` | /root/review_01/review_23 | complete |
| [24](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/24.md) | Files | `frontend/app/view/file` | /root/review_01/review_24 | complete |
| [25](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/25.md) | Editor/LSP | `frontend/app/lsp emain/emain-lsp.ts` | /root/review_01/review_25 | complete |
| [26](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/26.md) | Preview | `frontend/app/view/preview frontend/preview` | /root/review_01/review_26 | complete |
| [27](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/27.md) | Browser navigation | `frontend/app/view/webview` | /root/review_01/review_27 | complete |
| [28](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/28.md) | Computer use | `frontend/app/view/appstream` | /root/review_01/review_28 | complete |
| [29](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/29.md) | Sandbox | `pkg/sandbox` | /root/review_01/review_29 | complete |
| [30](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/30.md) | CLI | `cmd/wsh` | /root/review_01/review_30 | complete |
| [31](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/31.md) | MCP transport | `mcp-kron-term/src` | /root/review_01/review_31 | complete |
| [32](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/32.md) | MCP schemas | `mcp-kron-term/src mcp-kron-term/test` | /root/review_01/review_32 | complete |
| [33](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/33.md) | Hermes chat | `frontend/hermes/app/chat` | /root/review_33 | complete |
| [34](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/34.md) | Hermes plugins | `agents/hermes` | /root/review_34 | complete |
| [35](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/35.md) | Agent context | `frontend/app/view/hermes/selection-context.ts frontend/app/workspace` | /root/review_35 | complete |
| [36](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/36.md) | Approvals/cancellation | `emain/acp frontend/app/aipanel` | /root/review_36 | complete |
| [37](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/37.md) | AI providers | `pkg/waveai pkg/aiusechat` | /root/review_37 | complete |
| [38](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/38.md) | Voice | `audio-engine emain/emain-audio.ts` | /root/review_38 | complete |
| [39](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/39.md) | Agent evidence | `frontend/types/agent-activity.ts frontend/app/view/use-agent-overlays.ts` | /root/review_39 | complete |
| [40](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/40.md) | Mobile Labs | `mobile` | /root/review_40 | complete |
| [41](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/41.md) | Persistence | `pkg/wstore db` | /root/review_41 | complete |
| [42](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/42.md) | RPC | `pkg/wshrpc` | /root/review_42 | complete |
| [43](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/43.md) | Pubsub | `pkg/wps` | /root/review_43 | complete |
| [44](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/44.md) | Config | `pkg/wconfig` | /root/review_44 | complete |
| [45](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/45.md) | Jobs | `pkg/jobmanager` | /root/review_45 | complete |
| [46](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/46.md) | Tsunami | `tsunami/engine` | /root/review_46 | complete |
| [47](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/47.md) | Build/release | `Taskfile.yml electron-builder.config.cjs .github` | /root/review_47 | complete |
| [48](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/48.md) | Testing/observability | `package.json vitest.config.ts scripts` | /root/review_48 | complete |
| [49](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/49.md) | Website/docs | `website docs` | /root (direct review) | complete |
| [50](/Users/albsheralsadi/kronterm/improvement-review-2026-10-06/50.md) | Dependencies/licensing | `package.json go.mod NOTICE` | /root (direct review) | complete |

