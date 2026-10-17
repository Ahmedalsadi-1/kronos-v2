# KronTerm Agent — Complete Tools Audit

**Generated:** 2026-10-07
**Total Tools:** 191

---

## Table of Contents

1. [ACP (Agent Coordination Protocol)](#acp-agent-coordination-protocol)
2. [AI Sidebar](#ai-sidebar)
3. [App Workflow](#app-workflow)
4. [Workspace Sessions & Events](#workspace-sessions--events)
5. [Block & Widget Management](#block--widget-management)
6. [Browser Tools](#browser-tools)
7. [Canvas (Persisted Graph)](#canvas-persisted-graph)
8. [Canvas (Workspace Whiteboard)](#canvas-workspace-whiteboard)
9. [Device/Simulator Control](#devicesimulator-control)
10. [Developer Actions & Memory](#developer-actions--memory)
11. [File System](#file-system)
12. [Focus & Layout](#focus--layout)
13. [HUD (Heads-Up Display)](#hud-heads-up-display)
14. [Kron Computer Use (Native macOS Apps)](#kron-computer-use-native-macos-apps)
15. [Linux Desktop (Isolated VM)](#linux-desktop-isolated-vm)
16. [LSP (Language Server Protocol)](#lsp-language-server-protocol)
16. [Network/Connections](#networkconnections)
17. [Notifications](#notifications)
18. [Secrets Management](#secrets-management)
19. [Sandbox (Isolated VM)](#sandbox-isolated-vm)
20. [Surface & Config](#surface--config)
21. [Tabs & Badges](#tabs--badges)
22. [Terminal](#terminal)
23. [Widget Interaction](#widget-interaction)
24. [Workspace OS Actions](#workspace-os-actions)
25. [Workspace Presentation](#workspace-presentation)
26. [Miscellaneous](#miscellaneous)

---

## ACP (Agent Coordination Protocol)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `acp_list_agents` | ✅ | List installed ACP specialist agents that KronTerm Agent can invoke. Prefer kronoscode for coding and repository work. |
| `acp_run_agent` | ❌ | Run one bounded task with an installed ACP specialist. The child receives the active tab's scoped KronTerm MCP tools and shared skills. |

---

## AI Sidebar

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `ai_append` | ❌ | Append content (text + optional file attachments) to the KronTerm AI sidebar prompt. |

---

## App Workflow

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `app_workflow` | ✅ | Get a capability-checked recipe for inspecting apps, preparing drafts, or publishing authorized social content. Returns instructions only; performs no app actions. |

---

## Workspace Sessions & Events

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `append_workspace_session_event` | ❌ | Append terminal/browser/file/agent/sandbox activity to a workspace session. |
| `complete_workspace_session` | ❌ | Complete a workspace session with an optional summary. |
| `create_workspace_session` | ❌ | Create a KronTerm workspace session. This is the developer equivalent of Omi's conversation record. |
| `get_conversation_by_id` | ❌ | Omi-compatible alias for get_workspace_session. |
| `get_conversations` | ❌ | Omi-compatible alias for get_workspace_sessions. |
| `get_workspace_session` | ❌ | Get a KronTerm workspace session by ID, including captured events and linked memory/action IDs. |
| `get_workspace_sessions` | ❌ | List KronTerm workspace sessions. |
| `ingest_workspace_event` | ❌ | Record a workspace event and optionally create a linked memory and action item. |
| `search_conversations` | ❌ | Omi-compatible alias for search_workspace_sessions. |
| `search_workspace_sessions` | ❌ | Search KronTerm workspace sessions by title, summary, commands, URLs, paths, and event details. |

---

## Block & Widget Management

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `block_get_variables` | ❌ | Get variables set on a block. |
| `block_run_command` | ❌ | Run a shell command in a new terminal block. Creates a temporary block, executes the command, and can auto-close on success. |
| `block_set_variables` | ❌ | Set one or more variables on a block. |
| `close_block` | ❌ | Close/remove a block from the layout by its block ID. |
| `create_block` | ❌ | Create a new block in the current tab with the specified view type and configuration (term, web, preview, waveai, help, tips, sysinfo, launcher, sandbox, waveconfig). |
| `focus_block` | ❌ | Focus/select a specific block by its live block ID from list_blocks. |
| `get_block_content` | ✅ | Get the structured content and live state of any KronTerm block or widget as JSON (supported views: term, web, editor, preview, sandbox, waveai). |
| `get_block_info` | ❌ | Get detailed information about a specific block by ID. |
| `get_layout_tree` | ❌ | Get the authoritative presentation-aware workspace layout, including split-tree, ordered tabs, or canvas geometry. |
| `list_blocks` | ❌ | List all blocks in the current tab with their IDs, view types, and status. |
| `list_widgets` | ✅ | List configured launchable widgets (defwidget entries). Launch one by its key with trigger_widget. |
| `set_block_meta` | ❌ | Set a metadata key on a block (e.g. frame:title, frame:icon, icon:color, connection, url). |
| `trigger_widget` | ❌ | Execute/trigger a widget by its config key (e.g. 'defwidget@term', 'defwidget@ai'). Creates a block from the widget definition. |

---

## Browser Tools

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `browser_configure` | ❌ | Configure a KronTerm browser widget's behavior (zoom, partition, userAgent, pinnedUrl). |
| `browser_get_html` | ✅ | Query HTML from an existing KronTerm browser block using a CSS selector. |
| `browser_navigate` | ❌ | Navigate an existing KronTerm browser block to a URL. |
| `browser_open` | ❌ | Open a URL by reusing and focusing the active KronTerm browser surface. |
| `browser_open_tab` | ❌ | Navigate an existing KronTerm browser widget to a URL in place (compatibility alias of browser_navigate). |
| `browser_vault_enter_code` | ❌ | Enter a one-time/2FA code on the current page after password fill. |
| `browser_vault_fill` | ❌ | Fill the CURRENT browser page from a vault handle (login/payment/address). |
| `browser_vault_list` | ❌ | List saved website logins, payment cards and addresses as handles with metadata. |
| `browser_vault_save_login` | ❌ | Save a login for the current site when no vault item exists. |
| `browser_vault_unlock` | ❌ | Ask the user to unlock a password manager (1Password or Bitwarden) for this session. |

---

## Canvas (Persisted Graph)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `canvas_connect_nodes` | ❌ | Create an edge between two existing canvas nodes. |
| `canvas_create_node` | ❌ | Create a typed node in a KronTerm canvas graph. |
| `canvas_delete_node` | ❌ | Delete a canvas node and every edge attached to it. |
| `canvas_launch_node` | ❌ | Launch a launchable canvas node as a live KronTerm block. |
| `canvas_load` | ✅ | Load the full persisted KronTerm canvas document. |
| `canvas_save` | ❌ | Replace the full persisted canvas document. |
| `canvas_snapshot` | ✅ | Inspect a stable, sorted canvas graph before changing nodes or edges. |
| `canvas_update_node` | ❌ | Replace an existing canvas node. |
| `canvas_upload_asset` | ❌ | Copy a host-scoped local file into the canvas asset store. |

---

## Canvas (Workspace Whiteboard)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `workspace_canvas_add_note` | ❌ | Add a sticky note to the active workspace canvas. |
| `workspace_canvas_connect` | ❌ | Draw a whiteboard connector between two canvas object IDs. |
| `workspace_canvas_delete_object` | ❌ | Delete a sticky note or primitive whiteboard object. |
| `workspace_canvas_update_object` | ❌ | Edit or reposition a sticky note or primitive whiteboard object. |
| `workspace_canvas_view` | ❌ | Fit all canvas content into view or arrange live canvas widgets into a fitted grid. |

---

## Device/Simulator Control

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `device_back` | ❌ | Press Back on an Android ADB or Appium target. |
| `device_boot` | ❌ | Boot the exact listed iOS Simulator or Android AVD. |
| `device_home` | ❌ | Press Home on the exact observed simulator or Android device. |
| `device_list` | ✅ | List real Computers & Devices targets and current controlGeneration. |
| `device_open` | ❌ | Open the exact listed simulator in Apple's Simulator app. |
| `device_rotate` | ❌ | Rotate an iOS Simulator using its advertised capability. |
| `device_screenshot` | ✅ | Observe a booted simulator or connected mobile session and return a PNG image. |
| `device_shutdown` | ❌ | Shut down the exact listed emulator, ending its running apps. |
| `device_swipe` | ❌ | Swipe with normalized 0..1 coordinates on the observed simulator or Android device. |
| `device_tap` | ❌ | Tap an advertised simulator or mobile target using normalized screenshot coordinates 0..1. |
| `device_type` | ❌ | Enter literal text into the focused field on an advertised device. |

---

## Developer Actions & Memory

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `complete_action_item` | ❌ | Mark a developer action item done. |
| `create_action_item` | ❌ | Create a developer action item with optional session/memory linkage and evidence. |
| `create_memory` | ❌ | Create a developer memory with optional scope and provenance evidence. |
| `delete_action_item` | ❌ | Cancel a developer action item. |
| `delete_memory` | ❌ | Tombstone a developer memory by ID. |
| `developer_action_registry` | ❌ | List KronTerm's typed action registry. |
| `developer_memory_status` | ❌ | Report local developer-memory store path and available action registry size. |
| `edit_memory` | ❌ | Edit a developer memory's content, layer, category, status, or evidence. |
| `get_action_items` | ❌ | List developer action items extracted from or linked to workspace sessions. |
| `get_memories` | ❌ | List developer memories. |
| `get_memory` | ❌ | Get a single developer memory by ID. |
| `promote_memory` | ❌ | Promote a short-term or archive memory into long-term developer memory with an audit reason. |
| `search_action_items` | ❌ | Search developer action items. |
| `search_memories` | ❌ | Search developer memories by natural language query. |

---

## File System

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `file_info` | ❌ | Get metadata for a file or directory through KronTerm file access. |
| `file_list` | ❌ | List a directory through KronTerm file access. |
| `file_open` | ❌ | Open a file or directory in a KronTerm preview/file explorer block. |
| `file_read` | ❌ | Read a text file through KronTerm file access. |

---

## Focus & Layout

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `focus_pane` | ❌ | Reveal and focus a Hermes desktop pane (chat, files, terminal, review, sessions). |
| `workspace_focus_widget` | ❌ | Focus a widget in any presentation. |
| `workspace_move_widget` | ❌ | Move a widget using the active presentation's semantics. |
| `workspace_navigate` | ❌ | Navigate focus from a widget according to the active presentation. |
| `workspace_resize_widget` | ❌ | Resize a widget using the active presentation's semantics. |
| `workspace_swap_widgets` | ❌ | Swap two widgets in widgets or tabs presentation. |

---

## HUD (Heads-Up Display)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `hud_arrange_islands` | ❌ | Arrange every open HUD widget island as a cascade, fitted grid, horizontal strip, or vertical stack. |
| `hud_close_island` | ❌ | Close a native HUD island and delete its detached live block. |
| `hud_focus_island` | ❌ | Bring one native HUD island to the front and focus its live widget. |
| `hud_list_islands` | ✅ | Read the shared HUD widget inventory for the active KronTerm tab. |
| `hud_move_island` | ❌ | Move a native HUD island to absolute desktop work-area coordinates. |
| `hud_open_island` | ❌ | Launch a browser, files, terminal, editor, diff, sandbox, or widget in HUD. |
| `hud_resize_island` | ❌ | Resize a native HUD island in desktop pixels while preserving the live block session. |
| `hud_set_mode` | ❌ | Set Coucou HUD placement (hud, alongside, workspace). |
| `hud_set_widget_background` | ❌ | Background or restore an existing widget without deleting its block. |
| `hud_show_widget` | ❌ | Select and expand an existing live or background widget inside the HUD. |

---

## Kron Computer Use (Native macOS Apps)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `kron_computer_click` | ❌ | Click a native desktop app element by accessibility index or screenshot coordinates. |
| `kron_computer_drag` | ❌ | Drag between screenshot coordinates inside a native desktop app. |
| `kron_computer_get_app_state` | ✅ | Observe a native desktop app window. Returns an accessibility tree and screenshot. |
| `kron_computer_list_apps` | ✅ | List native desktop applications available to kron-computer-use. |
| `kron_computer_press_key` | ❌ | Press a key or key combination in a native desktop app using xdotool-style key syntax. |
| `kron_computer_scroll` | ❌ | Scroll an indexed native desktop app element in a direction by a number of pages. |
| `kron_computer_secondary_action` | ❌ | Invoke a secondary accessibility action exposed by a native desktop app element. |
| `kron_computer_sequence` | ❌ | Execute a short deterministic sequence in one native app without an LLM round trip. |
| `kron_computer_set_value` | ❌ | Set the value of a settable native desktop accessibility element. |
| `kron_computer_status` | ✅ | Report whether the optional kron-computer-use native desktop runtime is installed and running. |
| `kron_computer_turn_ended` | ❌ | Clear the kron-computer-use software cursor overlay when a native desktop interaction turn is complete. |
| `kron_computer_type_text` | ❌ | Type literal text into the focused field of a native desktop app. |

---

## Linux Desktop (Isolated VM)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `linux_desktop_click` | ❌ | Click the assigned Linux desktop using pixel coordinates from the captured screenshot. |
| `linux_desktop_exec` | ❌ | Execute a shell command inside this agent's assigned Linux desktop. |
| `linux_desktop_key` | ❌ | Send a supported key or shortcut to the assigned Linux desktop. |
| `linux_desktop_list` | ✅ | List managed Linux CUA desktops, readiness, assigned agents and control generations. |
| `linux_desktop_screenshot` | ✅ | Capture the assigned Linux desktop before acting; returns image and current generation. |
| `linux_desktop_scroll` | ❌ | Scroll the assigned Linux desktop by bounded horizontal and vertical amounts. |
| `linux_desktop_start` | ❌ | Start the exact desktop assigned to this agent. |
| `linux_desktop_stop` | ❌ | Stop this agent's assigned desktop, ending running applications. |
| `linux_desktop_type` | ❌ | Type literal text into the focused field of the assigned Linux desktop. |

---

## LSP (Language Server Protocol)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `lsp_definition` | ✅ | Read language-server definition locations at a zero-based source position. |
| `lsp_diagnostics` | ✅ | Read bounded language-server diagnostics for a workspace-contained source file. |
| `lsp_hover` | ✅ | Read language-server hover information at a zero-based source position. |
| `lsp_references` | ✅ | Read bounded language-server reference locations at a zero-based source position. |
| `lsp_symbols` | ✅ | Read bounded document symbols for a workspace-contained source file. |

---

## Network/Connections

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `connection_connect` | ❌ | Connect to a remote SSH or WSL connection. |
| `connection_disconnect` | ❌ | Disconnect a specific SSH or WSL connection. |
| `connection_disconnect_all` | ❌ | Disconnect all SSH and WSL connections. |
| `connection_list` | ❌ | List all SSH/WSL connections and their status. |

---

## Notifications

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `notify` | ❌ | Create a desktop notification through KronTerm. |

---

## Secrets Management

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `secret_delete` | ❌ | Delete a stored secret by name. |
| `secret_get` | ❌ | Get the value of a stored secret by name. |
| `secret_list` | ❌ | List all stored secret names. |
| `secret_set` | ❌ | Set the value of a secret. Creates or updates the secret by name. |

---

## Sandbox (Isolated VM)

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `sandbox_click` | ❌ | Click at sandbox coordinates or at the current sandbox pointer. |
| `sandbox_drag` | ❌ | Drag between coordinates in an isolated KronTerm sandbox desktop. |
| `sandbox_mouse_move` | ❌ | Move the mouse pointer in the isolated KronTerm sandbox desktop. |
| `sandbox_paste` | ❌ | Paste text into an isolated KronTerm sandbox desktop. |
| `sandbox_press` | ❌ | Press one or more keys in an isolated KronTerm sandbox desktop. |
| `sandbox_screenshot` | ✅ | Capture the current isolated KronTerm sandbox desktop as a screenshot. |
| `sandbox_scroll` | ❌ | Scroll in an isolated KronTerm sandbox desktop. |
| `sandbox_start` | ❌ | Start an isolated KronTerm sandbox desktop session for a user-requested sandboxed task. |
| `sandbox_status` | ❌ | Get the status of an isolated KronTerm sandbox desktop session. |
| `sandbox_stop` | ❌ | Stop an isolated KronTerm sandbox desktop session. |
| `sandbox_type` | ❌ | Type text into the focused field of the isolated KronTerm sandbox desktop. |

---

## Surface & Config

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `apply_layout` | ❌ | Apply a saved layout preset to the Hermes desktop app. |
| `kronterm_browser_navigate` | ❌ | Navigate an existing KronTerm browser block to a URL. |
| `kronterm_tool_search` | ❌ | Search enabled tools by name and description, with optional input schemas. |
| `set_config` | ❌ | Set KronTerm app configuration settings (e.g. {"app:layoutmode": "canvas"}). |
| `surface_status` | ❌ | Report selected wsh executable and required session environment availability. |

---

## Tabs & Badges

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `tab_clear_background` | ❌ | Clear the background image/color from a tab. |
| `tab_clear_badge` | ❌ | Clear the badge from a block tab. |
| `tab_set_background` | ❌ | Set a background image or color for a tab. |
| `tab_set_badge` | ❌ | Set a badge (icon) on a block tab. |

---

## Terminal

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `block_run_command` | ❌ | Run a shell command in a new terminal block. |
| `process_manage` | ❌ | Poll, wait on, or kill background terminal processes. |
| `read_terminal` | ❌ | Read the in-app terminal pane beside this chat. |
| `terminal` | ❌ | Execute shell commands (foreground/background). |
| `terminal_input` | ❌ | Send raw input to an existing terminal block's PTY. |
| `terminal_open` | ❌ | Open a shell terminal block. |
| `terminal_scrollback` | ❌ | Read visible/history output from a terminal block. |

---

## Widget Interaction

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `widget_clear` | ❌ | Clear the content of an input element by ref. |
| `widget_click` | ❌ | Click an element by ref or at coordinates within a KronTerm block. |
| `widget_clipboard_get` | ❌ | Get the current clipboard content from a block. |
| `widget_clipboard_set` | ❌ | Set clipboard text for paste operations in a block. |
| `widget_drag` | ❌ | Drag from one position to another within a block. |
| `widget_element_at` | ❌ | Identify which element (if any) is at a specific screen coordinate within a block. |
| `widget_find` | ❌ | Find interactive elements in a block by role, name, value, or text. |
| `widget_get_state` | ❌ | Get the current state of a block: view type, dimensions, focus status, and view-specific state. |
| `widget_get_value` | ❌ | Get the current value of an input element by ref. |
| `widget_hover` | ❌ | Hover over an element or coordinate within a block. |
| `widget_inspect` | ❌ | Get full metadata for a specific element by ref. |
| `widget_long_press` | ❌ | Press and hold at an element or position. |
| `widget_mouse_move` | ❌ | Move the mouse over an element by ref or to coordinates. |
| `widget_press` | ❌ | Press key(s) or key combinations. |
| `widget_screenshot` | ✅ | Capture a screenshot of any block. |
| `widget_screenshot_annotated` | ✅ | Capture a screenshot with element numbers overlaid. |
| `widget_scroll_to` | ❌ | Scroll to bring an element or position into view within a block. |
| `widget_select` | ❌ | Select an option in a select/combobox/dropdown element by ref. |
| `widget_sequence` | ❌ | Run a short deterministic browser or widget interaction sequence in one tool call. |
| `widget_set_value` | ❌ | Set the value of an input element by ref. |
| `widget_snapshot` | ❌ | Get all interactive elements in a block with positions, roles, and names. |
| `widget_toggle` | ❌ | Toggle a checkbox, switch, or expandable element by ref. |
| `widget_type` | ❌ | Type text into a focused KronTerm block. |
| `widget_wait_for` | ❌ | Wait for an element to reach a condition (visible, hidden, focused, enabled, disabled). |

---

## Workspace OS Actions

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `workspace_detach_widget` | ❌ | Detach a live side window from its OS workspace group while preserving its session. |
| `workspace_dock_widget` | ❌ | Dock one live OS workspace window beside another without replacing either session. |
| `workspace_open_app` | ❌ | Open a live application block in the active KronTerm OS workspace. |
| `workspace_open_command_center` | ❌ | Open KronTerm's unified command center for apps, sessions, files, settings, and compatibility layouts. |
| `workspace_open_file` | ❌ | Open a file or directory as a live preview session in the current KronTerm OS workspace. |
| `workspace_open_native_app` | ❌ | Open an installed desktop application as a live KronTerm OS app-stream session. |
| `workspace_os_action` | ❌ | Run one typed KronTerm OS action on the live desktop (launch, focus, move, resize, snap, minimize, restore, maximize, close, overview, place, arrange, switch space, open resource, set view). |
| `workspace_set_widget_collapsed` | ❌ | Minimize or restore a live window in KronTerm OS without closing its underlying session. |
| `workspace_show_overview` | ❌ | Show all live KronTerm OS windows in a calm, flat overview while preserving every session. |
| `workspace_switch_workspace` | ❌ | Switch the active KronTerm window to another persisted workspace. |

---

## Workspace Presentation

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `workspace_inventory` | ❌ | Discover all workspace/tab/widget owners and the user's current viewing context. |
| `workspace_set_os_view` | ❌ | Switch KronTerm OS between Canvas and File without replacing or restarting any live session. |
| `workspace_set_presentation` | ❌ | Switch the active workspace between tiled widgets, focused widget tabs, spatial canvas, and OS mode. |
| `workspace_snapshot` | ❌ | Read the authoritative active KronTerm presentation before operating. |
| `workspace_screenshot` | ❌ | Capture the complete active KronTerm widgets, tabs, canvas, or OS presentation. |
| `workspace_toggle_magnify` | ❌ | Toggle fullscreen magnification for a widget in tiled widgets presentation. |

---

## Miscellaneous

| Tool | ReadOnly | Description |
|------|----------|-------------|
| `clarify` | ❌ | Ask the user one or more questions when you need a decision, clarification, or feedback before proceeding. |
| `delegate_task` | ❌ | Spawn subagents in isolated contexts; each gets its own conversation, terminal session, and toolset. |
| `desktop_preview` | ❌ | Open, close, or read the preview pane beside the chat. |
| `execute_code` | ❌ | Run Python that calls Hermes tools programmatically. |
| `gui_tour` | ❌ | Guided tour in the desktop GUI: dim the screen, highlight an element, attach a titled popover. |
| `read_window_below` | ❌ | Identify the app window directly behind the Hermes desktop window. |
| `shared_skill_list` | ❌ | List allowlisted project skills shared by KronTerm, KronosCode, and ACP agents. |
| `shared_skill_read` | ❌ | Read one shared project skill by the exact id returned from shared_skill_list. |
| `show_tip` | ❌ | Point at one thing in the desktop UI with a small arrow bubble. |
| `skill_manage` | ❌ | Create, update, or delete skills — procedural memory for recurring task types. |
| `skill_view` | ❌ | Load a skill's full content or access its linked files (references, templates, scripts). |
| `skills_list` | ❌ | List available skills (name + description). |
| `text_to_speech` | ❌ | Convert text to speech audio. |
| `todo_list` | ❌ | Track a task list for multi-step work. |
| `tool_diagnostics` | ❌ | Read recent tool latency and outcomes without private widget content or credentials. |
| `vision_analyze` | ❌ | Load an image into the conversation so you can see it. |
| `web_extract` | ❌ | Extract content from web page URLs (returns markdown/text). |
| `web_search` | ❌ | Search the web for information. |

---

## Summary by Category

| Category | Tool Count | ReadOnly | ReadWrite |
|----------|------------|----------|-----------|
| ACP | 2 | 1 | 1 |
| AI Sidebar | 1 | 0 | 1 |
| App Workflow | 1 | 1 | 0 |
| Workspace Sessions | 9 | 0 | 9 |
| Block & Widget Mgmt | 14 | 1 | 13 |
| Browser | 10 | 1 | 9 |
| Canvas (Persisted) | 9 | 2 | 7 |
| Canvas (Whiteboard) | 5 | 0 | 5 |
| Device/Simulator | 11 | 2 | 9 |
| Developer Actions & Memory | 13 | 0 | 13 |
| File System | 4 | 0 | 4 |
| Focus & Layout | 6 | 0 | 6 |
| HUD | 10 | 1 | 9 |
| Kron Computer Use | 12 | 3 | 9 |
| Linux Desktop | 9 | 2 | 7 |
| LSP | 5 | 5 | 0 |
| Network/Connections | 4 | 0 | 4 |
| Notifications | 1 | 0 | 1 |
| Secrets | 4 | 0 | 4 |
| Sandbox | 11 | 1 | 10 |
| Surface & Config | 5 | 0 | 5 |
| Tabs & Badges | 4 | 0 | 4 |
| Terminal | 7 | 0 | 7 |
| Widget Interaction | 28 | 2 | 26 |
| Workspace OS Actions | 11 | 0 | 11 |
| Workspace Presentation | 6 | 0 | 6 |
| Miscellaneous | 21 | 0 | 21 |
| **TOTAL** | **191** | **21** | **170** |

---

## Quick Reference: Most Common Entry Points

| Task | Start With |
|------|------------|
| Inspect current workspace | `workspace_snapshot` |
| List all blocks | `list_blocks` |
| Find a tool | `kronterm_tool_search` |
| Read a file | `file_read` |
| Run a command | `terminal` or `block_run_command` |
| Control browser | `browser_open` → `widget_snapshot` → `widget_click`/`widget_type` |
| Work with canvas | `canvas_snapshot` → `canvas_create_node`/`canvas_connect_nodes` |
| Native macOS app | `kron_computer_get_app_state` → `kron_computer_click` |
| HUD widgets | `hud_list_islands` → `hud_show_widget` |
| Terminal output | `terminal_scrollback` |
| Search memories | `search_memories` |
| Create action item | `create_action_item` |

---

*This audit was generated by querying `kronterm_tool_search` with `includeSchemas=true` and categorizing all 191 returned tools.*