# KronOS v2 MCP tool inventory

Snapshot of all 257 enabled registrations in the local KronOS MCP source, November 15, 2026. Generated from the registry before runtime allowlists. Tool visibility and availability depend on the client, build, permissions, providers and connected surfaces. This is the KronOS bridge inventory; Hermes built-ins, external MCP servers, actions inside a tool, and CLI commands are separate.

## Workspace & OS (55)

- `ai_append`
- `block_get_variables`
- `block_set_variables`
- `close_block`
- `connection_connect`
- `connection_disconnect`
- `connection_disconnect_all`
- `connection_list`
- `create_block`
- `focus_block`
- `get_block_info`
- `get_layout_tree`
- `get_workspace_info`
- `list_blocks`
- `notify`
- `secret_delete`
- `secret_get`
- `secret_list`
- `secret_set`
- `set_block_meta`
- `set_config`
- `surface_status`
- `tab_clear_background`
- `tab_clear_badge`
- `tab_set_background`
- `tab_set_badge`
- `workspace_design_create_layer`
- `workspace_design_editor_state`
- `workspace_design_execute`
- `workspace_design_layers`
- `workspace_design_read_skill`
- `workspace_design_save`
- `workspace_design_update_layer`
- `workspace_detach_widget`
- `workspace_dock_widget`
- `workspace_focus_widget`
- `workspace_inventory`
- `workspace_move_widget`
- `workspace_navigate`
- `workspace_open_app`
- `workspace_open_command_center`
- `workspace_open_file`
- `workspace_open_native_app`
- `workspace_organize`
- `workspace_os_action`
- `workspace_resize_widget`
- `workspace_screenshot`
- `workspace_set_os_view`
- `workspace_set_presentation`
- `workspace_set_widget_collapsed`
- `workspace_show_overview`
- `workspace_snapshot`
- `workspace_swap_widgets`
- `workspace_switch_workspace`
- `workspace_toggle_magnify`

## HUD islands (10)

- `hud_arrange_islands`
- `hud_close_island`
- `hud_focus_island`
- `hud_list_islands`
- `hud_move_island`
- `hud_open_island`
- `hud_resize_island`
- `hud_set_mode`
- `hud_set_widget_background`
- `hud_show_widget`

## Widget interaction (28)

- `get_block_content`
- `list_widgets`
- `trigger_widget`
- `widget_clear`
- `widget_click`
- `widget_clipboard_get`
- `widget_clipboard_set`
- `widget_drag`
- `widget_element_at`
- `widget_find`
- `widget_get_state`
- `widget_get_value`
- `widget_hover`
- `widget_inspect`
- `widget_long_press`
- `widget_mouse_move`
- `widget_press`
- `widget_screenshot`
- `widget_screenshot_annotated`
- `widget_scroll`
- `widget_scroll_to`
- `widget_select`
- `widget_sequence`
- `widget_set_value`
- `widget_snapshot`
- `widget_toggle`
- `widget_type`
- `widget_wait_for`

## Browser (5)

- `browser_configure`
- `browser_get_html`
- `browser_navigate`
- `browser_open`
- `browser_open_tab`

## Terminal (4)

- `block_run_command`
- `terminal_input`
- `terminal_open`
- `terminal_scrollback`

## Linux VM & devices (Labs) (47)

- `device_assign`
- `device_assignments`
- `device_back`
- `device_batch_boot`
- `device_batch_cancel`
- `device_batch_start`
- `device_batch_status`
- `device_boot`
- `device_home`
- `device_identity`
- `device_key`
- `device_list`
- `device_observe`
- `device_open`
- `device_release`
- `device_rotate`
- `device_screenshot`
- `device_shutdown`
- `device_step`
- `device_swipe`
- `device_tap`
- `device_type`
- `linux_desktop_apps`
- `linux_desktop_batch`
- `linux_desktop_click`
- `linux_desktop_drag`
- `linux_desktop_exec`
- `linux_desktop_key`
- `linux_desktop_launch_app`
- `linux_desktop_list`
- `linux_desktop_open_url`
- `linux_desktop_screenshot`
- `linux_desktop_scroll`
- `linux_desktop_shortcut`
- `linux_desktop_start`
- `linux_desktop_stop`
- `linux_desktop_type`
- `sandbox_task_finish`
- `sandbox_task_start`
- `sandbox_vm_browser`
- `sandbox_vm_desktop`
- `sandbox_vm_exec`
- `sandbox_vm_files`
- `sandbox_vm_handback`
- `sandbox_vm_login`
- `sandbox_vm_login_preferences`
- `sandbox_vm_status`

## Native apps (23)

- `kron_computer_annotate`
- `kron_computer_background_workspace_action`
- `kron_computer_background_workspace_finish`
- `kron_computer_background_workspace_launch`
- `kron_computer_background_workspace_list`
- `kron_computer_background_workspace_observe`
- `kron_computer_background_workspace_open_file`
- `kron_computer_background_workspace_resume`
- `kron_computer_background_workspace_reveal`
- `kron_computer_background_workspace_start`
- `kron_computer_click`
- `kron_computer_drag`
- `kron_computer_get_app_state`
- `kron_computer_list_apps`
- `kron_computer_press_key`
- `kron_computer_scroll`
- `kron_computer_secondary_action`
- `kron_computer_sequence`
- `kron_computer_set_value`
- `kron_computer_status`
- `kron_computer_turn_ended`
- `kron_computer_type_text`
- `kron_computer_window`

## Files (4)

- `file_info`
- `file_list`
- `file_open`
- `file_read`

## Canvas (15)

- `canvas_connect_nodes`
- `canvas_create_node`
- `canvas_delete_node`
- `canvas_launch_node`
- `canvas_load`
- `canvas_save`
- `canvas_snapshot`
- `canvas_update_node`
- `canvas_upload_asset`
- `workspace_canvas_add_file`
- `workspace_canvas_add_note`
- `workspace_canvas_connect`
- `workspace_canvas_delete_object`
- `workspace_canvas_update_object`
- `workspace_canvas_view`

## Code intelligence (5)

- `lsp_definition`
- `lsp_diagnostics`
- `lsp_hover`
- `lsp_references`
- `lsp_symbols`

## Memory & sessions (25)

- `append_workspace_session_event`
- `complete_action_item`
- `complete_workspace_session`
- `create_action_item`
- `create_memory`
- `create_workspace_session`
- `delete_action_item`
- `delete_memory`
- `developer_action_registry`
- `developer_memory_status`
- `edit_memory`
- `get_action_items`
- `get_conversation_by_id`
- `get_conversations`
- `get_memories`
- `get_memory`
- `get_workspace_session`
- `get_workspace_sessions`
- `ingest_workspace_event`
- `promote_memory`
- `search_action_items`
- `search_conversations`
- `search_memories`
- `search_workspace_sessions`
- `update_action_item`

## Shared skills (2)

- `shared_skill_list`
- `shared_skill_read`

## Agents & delegation (8)

- `acp_list_agents`
- `acp_run_agent`
- `delegation_status`
- `swarm_cancel`
- `swarm_replan`
- `swarm_start`
- `swarm_status`
- `swarm_targets`

## Workflows (21)

- `comfyui_cancel`
- `comfyui_image`
- `comfyui_job`
- `comfyui_status`
- `comfyui_submit`
- `n8n_create_workflow`
- `n8n_edit_workflow`
- `n8n_get_execution`
- `n8n_get_executions`
- `n8n_get_node`
- `n8n_get_workflow`
- `n8n_list_workflows`
- `n8n_list_workspace_widgets`
- `n8n_organize_workflows`
- `n8n_run_agent`
- `n8n_run_workflow`
- `n8n_search_nodes`
- `n8n_status`
- `n8n_validate_workflow`
- `workflow_run`
- `workflow_runs`

## Productivity (2)

- `productivity_query`
- `productivity_update`

## Tool discovery (3)

- `app_workflow`
- `tool_diagnostics`
- `tool_search`
