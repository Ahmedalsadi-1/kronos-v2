from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


PLUGIN_PATH = Path(__file__).parents[1] / "plugins" / "kronterm-tools" / "__init__.py"


def _load_plugin():
    spec = importlib.util.spec_from_file_location("kronterm_tools_test_plugin", PLUGIN_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_routine_commands_cannot_create_visible_terminal_widgets(monkeypatch):
    plugin = _load_plugin()
    calls = []
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: calls.append(payload))
    for name in ("terminal_open", "block_run_command"):
        for visible in (None, False, "true", 1):
            args = {"command": "pwd"}
            if visible is not None:
                args["visible"] = visible
            result = json.loads(plugin._handler(name)(args))
            assert "headless commands" in result["error"]
            assert "No widget was opened" in result["error"]
    assert calls == []


def test_explicit_visible_terminal_preserves_execution_guards_and_identity(monkeypatch):
    plugin = _load_plugin()
    calls, guards = [], []
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: "ui-chat")

    def bridge(payload):
        calls.append(payload)
        return {"content": [{"type": "text", "text": "opened"}]}

    def run_action(name, args, run):
        guards.append((name, args))
        return run()

    monkeypatch.setattr(plugin, "_bridge_request", bridge)
    for name in ("terminal_open", "block_run_command"):
        args = {"visible": True, "cwd": "/project", "command": "pwd"}
        assert plugin._handler(name, run_action)(args, session_id="engine", task_id="task") == "opened"
        assert calls[-1] == {"method": "call", "name": name,
                             "arguments": {"cwd": "/project", "command": "pwd"},
                             "sessionId": "ui-chat", "taskId": "task"}
        assert guards[-1] == (name, calls[-1]["arguments"])
        assert args["visible"] is True


def test_visible_terminal_schema_matches_discovery_without_mutating_manifest():
    plugin = _load_plugin()
    for name in ("terminal_open", "block_run_command"):
        tool = {"name": name, "description": "Open terminal", "inputSchema": {
            "type": "object", "properties": {"cwd": {"type": "string"}}, "required": ["cwd"]}}
        original = json.loads(json.dumps(tool))
        schema = plugin._schema(tool, name)
        assert schema["parameters"]["properties"]["visible"]["default"] is False
        assert schema["parameters"]["required"] == ["cwd"]
        assert "headless terminal" in schema["description"]
        discovered = plugin._exposed_discovery_result({
            "content": [{"type": "text", "text": json.dumps({"tools": [tool]})}],
            "structuredContent": {"tools": [tool]}})
        text_tool = json.loads(discovered["content"][0]["text"])["tools"][0]
        assert text_tool == discovered["structuredContent"]["tools"][0]
        assert text_tool["inputSchema"] == schema["parameters"]
        assert text_tool["description"] == schema["description"]
        assert tool == original
        compact = plugin._exposed_discovery_result({"structuredContent": {"tools": [
            {"name": name, "description": "Open terminal"}]}})["structuredContent"]["tools"][0]
        assert "inputSchema" not in compact
        assert "visible=true" in compact["description"]


def test_registers_bridge_manifest_and_preserves_collision_alias(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")

    def bridge_request(payload):
        if payload["method"] == "manifest":
            return {
                "tools": [
                    {"name": "surface_status", "description": "Read status", "inputSchema": {"type": "object"}},
                    {"name": "browser_navigate", "description": "Navigate", "inputSchema": {"type": "object"}},
                    {"name": "sandbox_start", "description": "Start VM", "inputSchema": {"type": "object"}},
                    {"name": "tool_search", "description": "Find tools", "inputSchema": {"type": "object"}},
                ]
            }
        if payload["method"] == "list":
            return {
                "tools": [
                    {"name": "surface_status"},
                    {"name": "browser_navigate"},
                ]
            }
        return {"content": [{"type": "text", "text": payload["name"]}]}

    monkeypatch.setattr(plugin, "_bridge_request", bridge_request)
    registrations = []

    class Context:
        def register_tool(self, **kwargs):
            registrations.append(kwargs)

    plugin.register(Context())

    by_name = {registration["name"]: registration for registration in registrations}
    assert set(by_name) == {"surface_status", "kronterm_browser_navigate", "sandbox_start", "kronterm_tool_search"}
    assert by_name["kronterm_tool_search"]["handler"]({}) == "tool_search"
    assert by_name["surface_status"]["toolset"] == "kronterm"
    assert by_name["kronterm_browser_navigate"]["handler"]({}) == "browser_navigate"
    # availability comes from the workspace-scoped list, not the full manifest
    assert by_name["kronterm_browser_navigate"]["check_fn"]() is True
    assert by_name["sandbox_start"]["check_fn"]() is False


def test_normalizes_image_results_for_hermes():
    plugin = _load_plugin()

    result = plugin._normalize_result(
        {
            "content": [
                {"type": "text", "text": "captured"},
                {"type": "image", "mimeType": "image/png", "data": "aW1hZ2U="},
            ]
        }
    )

    assert result["_multimodal"] is True
    assert result["content"][1]["image_url"]["url"] == "data:image/png;base64,aW1hZ2U="


def test_bridge_errors_surface_the_server_message(monkeypatch):
    import io
    import urllib.error

    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")

    def urlopen(_request, timeout):
        assert timeout == plugin._TIMEOUT_SECONDS
        body = io.BytesIO(json.dumps({"error": "Tool widget_click is unavailable"}).encode())
        raise urllib.error.HTTPError("http://127.0.0.1:9119/native", 404, "Not Found", {}, body)

    monkeypatch.setattr(plugin, "_open_request", urlopen)
    result = json.loads(plugin._handler("widget_click")({}))
    assert result["error"] == "KronTerm tool bridge rejected the call (404): Tool widget_click is unavailable"


def test_manifest_registration_recovers_after_bridge_startup_failure(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    responses = iter([
        {"error": "Connection refused"},
        {"tools": [{"name": "workspace_snapshot", "inputSchema": {"type": "object"}}]},
    ])
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: next(responses))
    delays = []
    monkeypatch.setattr(plugin.time, "sleep", delays.append)
    registrations = []

    class Context:
        def register_tool(self, **kwargs):
            registrations.append(kwargs)

    plugin.register(Context())
    assert registrations[0]["name"] == "workspace_snapshot"
    assert delays == [0.25]


def test_failed_tool_call_rechecks_current_surface_capabilities(monkeypatch):
    plugin = _load_plugin()
    key = plugin._availability_key("")
    plugin._allowed_cache[key] = (plugin.time.monotonic() + 1, frozenset({"widget_click"}))
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: {"error": "Tool widget_click is unavailable"})
    result = json.loads(plugin._handler("widget_click")({}))
    assert "unavailable" in result["error"]
    assert key not in plugin._allowed_cache


def test_read_calls_and_long_operations_use_distinct_socket_budgets(monkeypatch):
    import io
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    plugin._readonly_tools.update({"workspace_snapshot", "n8n_search_nodes", "workspace_design_editor_state", "workspace_design_read_skill"})
    budgets = []
    def urlopen(_request, timeout):
        budgets.append(timeout)
        return io.BytesIO(b'{"content":[]}')
    monkeypatch.setattr(plugin, "_open_request", urlopen)
    for name, arguments in [
        ("workspace_snapshot", {}),
        ("widget_click", {}),
        ("sandbox_task_start", {}),
        ("acp_run_agent", {"timeoutSeconds": 600}),
        ("n8n_search_nodes", {}),
        ("n8n_run_agent", {"timeoutSeconds": 180}),
        ("workspace_design_editor_state", {}),
        ("workspace_design_read_skill", {"name": "execute"}),
        ("workspace_design_execute", {"code": "test"}),
        ("workspace_design_save", {}),
    ]:
        plugin._bridge_request({"method": "call", "name": name, "arguments": arguments})
    assert budgets == [15, 35, 185, 610, 125, 305, 95, 95, 95, 95]


def test_failure_metadata_survives_hermes_normalization():
    plugin = _load_plugin()
    result = json.loads(plugin._normalize_result({"isError": True, "content": [{"type": "text", "text": "No target"}], "_meta": {"failure": {"code": "TARGET_CLOSED", "retryable": False}}}))
    assert result["failure"]["code"] == "TARGET_CLOSED"


def test_capability_cache_is_scoped_to_bridge_identity(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "first-token")
    responses = iter([{"tools": [{"name": "widget_click"}]}, {"tools": [{"name": "workspace_snapshot"}]}])
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: next(responses))
    assert plugin._tool_allowed("widget_click")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "second-token")
    assert not plugin._tool_allowed("widget_click")
    assert plugin._tool_allowed("workspace_snapshot")


def test_failed_capability_refresh_does_not_reuse_expired_authority(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    responses = iter([{"tools": [{"name": "widget_click"}]}, {"error": "Connection refused"}])
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: next(responses))
    clock = iter([0.0, 0.0, 30.0, 30.0])
    monkeypatch.setattr(plugin.time, "monotonic", lambda: next(clock))
    assert plugin._tool_allowed("widget_click")
    assert not plugin._tool_allowed("widget_click")
    assert next(iter(plugin._allowed_cache.values()))[1] == frozenset()


def test_null_metadata_does_not_break_tool_result():
    plugin = _load_plugin()
    assert plugin._normalize_result({"content": [{"type": "text", "text": "done"}], "_meta": None}) == "done"


def test_capability_outage_is_coalesced_and_recovers(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    calls = []
    def request(payload):
        calls.append(payload)
        return {"error": "offline"} if len(calls) == 1 else {"tools": [{"name": "widget_click"}]}
    monkeypatch.setattr(plugin, "_bridge_request", request)
    clock = iter([0.0, 0.0, 1.0, 3.0, 3.0])
    monkeypatch.setattr(plugin.time, "monotonic", lambda: next(clock))
    assert not plugin._tool_allowed("widget_click")
    assert not plugin._tool_allowed("widget_type")
    assert plugin._tool_allowed("widget_click")
    assert len(calls) == 2


def test_discovery_names_match_registered_aliases_and_queries_are_canonical(monkeypatch):
    plugin = _load_plugin()
    calls = []
    def request(payload):
        calls.append(payload)
        return {"content": [{"type": "text", "text": json.dumps({"tools": [
            {"name": "browser_navigate", "description": "Use tool_search first", "inputSchema": {"type": "object"}}
        ]})}]}
    monkeypatch.setattr(plugin, "_bridge_request", request)
    result = json.loads(plugin._handler("tool_search")({"query": "kronterm_browser_navigate"}))
    assert calls[0]["arguments"]["query"] == "browser_navigate"
    assert result["tools"][0]["name"] == "kronterm_browser_navigate"
    assert result["tools"][0]["description"] == "Use kronterm_tool_search first"
    assert plugin._schema({"description": "Use browser_navigate"}, "sample")["description"] == "Use kronterm_browser_navigate"


def test_normal_widget_content_is_never_rewritten_as_tool_discovery(monkeypatch):
    plugin = _load_plugin()
    content = '{"text":"browser_navigate and tool_search are quoted page content"}'
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: {"content": [{"type": "text", "text": content}]})
    assert plugin._handler("widget_snapshot")({}) == content


def test_shared_skill_instructions_use_the_registered_hermes_aliases(monkeypatch):
    plugin = _load_plugin()
    response = {"skill": {"id": "agents/tool_search", "name": "tool_search"},
                "content": "Use tool_search with family=browser, then browser_navigate. Keep my_tool_search unchanged."}
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: {
        "content": [{"type": "text", "text": json.dumps(response)}]})
    result = json.loads(plugin._handler("shared_skill_read")({"id": "agents/tool_search"}))
    assert result["skill"] == response["skill"]
    assert result["content"] == "Use kronterm_tool_search with family=browser, then kronterm_browser_navigate. Keep my_tool_search unchanged."


def test_background_workspace_budget_outlives_server_deadline(monkeypatch):
    import io
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    budgets = []
    def urlopen(request, timeout):
        budgets.append(timeout)
        return io.BytesIO(b'{"content":[]}')
    monkeypatch.setattr(plugin, "_open_request", urlopen)
    plugin._readonly_tools.add("kron_computer_background_workspace_observe")
    for operation in ["start", "launch", "observe"]:
        plugin._bridge_request({"method": "call", "name": "kron_computer_background_workspace_" + operation, "arguments": {}})
    assert budgets == [130, 130, 130]


def test_timed_out_mutations_remain_uncertain_and_are_never_replayed(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    calls = []
    def urlopen(request, timeout):
        calls.append(request)
        raise TimeoutError("timed out")
    monkeypatch.setattr(plugin, "_open_request", urlopen)
    plugin._readonly_tools.add("widget_snapshot")
    mutation = json.loads(plugin._handler("widget_type")({"text": "once"}))
    observation = json.loads(plugin._handler("widget_snapshot")({}))
    assert mutation["failure"] == {"code": "TRANSPORT_FAILED", "retryable": False, "uncertain": True}
    assert observation["failure"]["uncertain"] is False
    assert len(calls) == 2


def test_discovery_keeps_invalid_results_as_errors_and_rewrites_status_guide(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: {"content": None})
    assert "invalid result" in json.loads(plugin._handler("tool_search")({}))["error"]
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: {"content": [
        {"type": "text", "text": json.dumps({"guide": "Use browser_navigate or kronterm_tool_search"})}]})
    result = json.loads(plugin._handler("surface_status")({}))
    assert result["guide"] == "Use kronterm_browser_navigate or kronterm_tool_search"


def test_invalid_timeout_arguments_reach_server_validation_without_crashing_adapter(monkeypatch):
    import io
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    calls = []
    def urlopen(request, timeout):
        calls.append((json.loads(request.data), timeout))
        return io.BytesIO(b'{"isError":true,"content":[{"type":"text","text":"invalid arguments"}]}')
    monkeypatch.setattr(plugin, "_open_request", urlopen)
    for name, args in [("acp_run_agent", {"timeoutSeconds": "bad"}), ("widget_wait_for", {"timeoutMs": None})]:
        result = json.loads(plugin._handler(name)(args))
        assert result["error"] == "invalid arguments"
        assert calls[-1][0]["arguments"] == args
    assert [budget for _, budget in calls] == [190, 17]


def test_lost_mutation_receipt_stays_uncertain_when_response_is_malformed(monkeypatch):
    import io
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    for body in [b'{"partial":', b'[]']:
        monkeypatch.setattr(plugin, "_open_request", lambda request, timeout: io.BytesIO(body))
        result = json.loads(plugin._handler("widget_type")({"text": "once"}))
        assert result["failure"]["uncertain"] is True
        assert result["failure"]["retryable"] is False


def test_non_object_arguments_fail_before_transport(monkeypatch):
    plugin = _load_plugin()
    calls = []
    monkeypatch.setattr(plugin, "_bridge_request", lambda payload: calls.append(payload))
    for value in [None, [], "bad", 3]:
        assert "must be an object" in json.loads(plugin._handler("tool_search")(value))["error"]
    assert calls == []


def test_native_and_vm_budgets_outlive_the_server_deadline(monkeypatch):
    import io
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    budgets = []
    def urlopen(request, timeout):
        budgets.append(timeout)
        return io.BytesIO(b'{"content":[]}')
    monkeypatch.setattr(plugin, "_open_request", urlopen)
    for name in ["kron_computer_get_app_state", "kron_computer_click", "linux_desktop_start", "linux_desktop_exec", "linux_desktop_screenshot"]:
        plugin._bridge_request({"method": "call", "name": name, "arguments": {}})
    assert budgets == [130, 130, 185, 105, 65]


def test_bridge_never_sends_tokens_to_nonlocal_or_invalid_endpoints(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    monkeypatch.setattr(plugin, "_open_request", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not dispatch")))
    for url in ["https://remote.example/native", "http://user:pass@127.0.0.1/native", "http://127.0.0.1/wrong", "http://127.0.0.1:bad/native"]:
        monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", url)
        assert plugin._bridge_request({"method": "call", "name": "widget_click"}).get("error")


def test_bridge_reuses_connection_without_reusing_authorization(monkeypatch):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread

    requests = []
    connections = []

    class Server(ThreadingHTTPServer):
        def get_request(self):
            connection, address = super().get_request()
            connections.append(address)
            return connection, address

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers["Authorization"], self.headers.get("Cookie"), body))
            if body["method"] == "drop":
                self.close_connection = True
                return
            partial = body.get("name") == "widget_type"
            result = b'{"tools":[]}' if body["method"] == "list" or partial else b'{"error":"redirect denied"}'
            self.send_response(200 if body["method"] == "list" or partial else 302)
            self.send_header("Content-Length", str(len(result) + int(partial)))
            if partial:
                self.close_connection = True
            self.send_header("Set-Cookie", "session=untrusted")
            self.send_header("Location", "/unexpected")
            self.end_headers()
            self.wfile.write(result)

    plugin = _load_plugin()
    with Server(("127.0.0.1", 0), Handler) as server:
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", f"http://127.0.0.1:{server.server_port}/native")
        try:
            monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "first")
            assert plugin._bridge_request({"method": "list", "sessionId": "a"}) == {"tools": []}
            assert plugin._bridge_request({"method": "list", "sessionId": "b"}) == {"tools": []}
            monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "second")
            assert "redirect denied" in plugin._bridge_request({"method": "redirect"})["error"]
            assert len(connections) == 2
            assert plugin._bridge_request({"method": "drop"})["failure"]["retryable"] is False
            assert len(connections) == 3
            monkeypatch.setattr(plugin, "_MAX_OUTPUT_BYTES", len(b'{"tools":[]}') - 1)
            assert "oversized response" in plugin._bridge_request({"method": "list"})["error"]
            monkeypatch.setattr(plugin, "_MAX_OUTPUT_BYTES", len(b'{"tools":[]}'))
            assert plugin._bridge_request({"method": "list"}) == {"tools": []}
            assert len(connections) == 5
            assert requests == [
                ("/native", "Bearer first", None, {"method": "list", "sessionId": "a"}),
                ("/native", "Bearer first", None, {"method": "list", "sessionId": "b"}),
                ("/native", "Bearer second", None, {"method": "redirect"}),
                ("/native", "Bearer second", None, {"method": "drop"}),
                ("/native", "Bearer second", None, {"method": "list"}),
                ("/native", "Bearer second", None, {"method": "list"}),
            ]
            response = plugin._bridge_request({"method": "call", "name": "widget_type"})
            assert response["failure"] == {"code": "TRANSPORT_FAILED", "retryable": False, "uncertain": True}
            assert len(requests) == 7
            assert plugin._bridge_request({"method": "list"}) == {"tools": []}
            assert len(connections) == 6
        finally:
            for _, _, connection in plugin._idle_connections:
                connection.close()
            server.shutdown()
            worker.join()


def test_parallel_availability_checks_share_one_inflight_refresh(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier, Event

    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    start = Barrier(8)
    entered = Event()
    release = Event()
    calls = []

    def bridge_request(payload):
        calls.append(payload)
        entered.set()
        assert release.wait(5)
        return {"tools": [{"name": "widget_snapshot"}]}

    def check():
        start.wait(timeout=5)
        return plugin._tool_allowed("widget_snapshot")

    monkeypatch.setattr(plugin, "_bridge_request", bridge_request)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(check) for _ in range(8)]
        try:
            assert entered.wait(5)
        finally:
            release.set()
        assert all(future.result(timeout=5) for future in futures)
    assert calls == [{"method": "list", "namesOnly": True}]

    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "replacement-token")
    assert plugin._tool_allowed("widget_snapshot")
    assert len(calls) == 2


def test_sandbox_calls_use_runtime_session_identity_not_model_arguments(monkeypatch):
    plugin = _load_plugin()
    calls = []

    def bridge(payload):
        calls.append(payload)
        return {"content": [{"type": "text", "text": "ok"}]}

    monkeypatch.setattr(plugin, "_bridge_request", bridge)
    plugin._handler("sandbox_vm_exec")(
        {"command": "pwd", "sessionId": "forged-session"}, session_id="runtime-session", task_id="task-session"
    )
    assert calls[0]["sessionId"] == "runtime-session"
    assert calls[0]["arguments"]["sessionId"] == "forged-session"


def test_sandbox_calls_prefer_bound_chat_over_engine_dispatcher_identity(monkeypatch):
    plugin = _load_plugin()
    calls = []
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: "ui-chat")

    def bridge(payload):
        calls.append(payload)
        return {"content": [{"type": "text", "text": "ok"}]}

    monkeypatch.setattr(plugin, "_bridge_request", bridge)
    plugin._handler("sandbox_vm_status")({}, session_id="engine-session", task_id="engine-task")
    assert calls[0]["sessionId"] == "ui-chat"


def test_offline_manifest_registers_tools_during_bridge_outage(monkeypatch, tmp_path):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    file = tmp_path / "manifest.json"
    file.write_text(json.dumps({"tools": [{"name": "sandbox_vm_exec", "annotations": {"readOnlyHint": False}}]}))
    monkeypatch.setenv("KRONTERM_TOOL_MANIFEST_FILE", str(file))
    monkeypatch.setattr(plugin, "_bridge_request", lambda _: (_ for _ in ()).throw(AssertionError("network requested")))
    assert plugin._manifest_tools()[0]["name"] == "sandbox_vm_exec"


def test_availability_isolated_by_runtime_chat_and_delegated_lease(monkeypatch):
    plugin = _load_plugin()
    identity = ["chat:1"]
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: identity[0])
    calls = []
    def listing(_):
        calls.append(identity[0])
        return {"tools": [{"name": "sandbox_vm_exec" if plugin._job_scope.get() else identity[0]}]}
    monkeypatch.setattr(plugin, "_bridge_request", listing)
    assert plugin._allowed_tools() == {"chat:1"}
    identity[0] = "chat:2"
    assert plugin._allowed_tools() == {"chat:2"}
    token = plugin._job_scope.set({"token": "private", "scope": "sandbox"})
    assert plugin._allowed_tools() == {"sandbox_vm_exec"}
    plugin._job_scope.reset(token)
    assert plugin._allowed_tools() == {"chat:2"}
    assert len(calls) == 3


def test_slow_chat_refresh_does_not_block_another_chat(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from contextvars import ContextVar
    from threading import Event

    plugin = _load_plugin()
    identity = ContextVar("chat")
    monkeypatch.setattr(plugin, "_runtime_identity", identity.get)
    slow_started, release_slow = Event(), Event()

    def listing(_):
        if identity.get() == "slow":
            slow_started.set()
            assert release_slow.wait(5)
        return {"tools": [{"name": identity.get()}]}

    def available(chat):
        token = identity.set(chat)
        try:
            return plugin._allowed_tools()
        finally:
            identity.reset(token)

    monkeypatch.setattr(plugin, "_bridge_request", listing)
    with ThreadPoolExecutor(max_workers=2) as pool:
        slow = pool.submit(available, "slow")
        try:
            assert slow_started.wait(5)
            assert pool.submit(available, "fast").result(timeout=2) == {"fast"}
        finally:
            release_slow.set()
        assert slow.result(timeout=2) == {"slow"}


def test_swarm_middleware_filters_model_tools_and_fails_closed_for_execution(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: "ui-worker")
    callbacks = {}
    response = {"scope": {"swarm": True}, "tools": [{"name": "browser_navigate"}, {"name": "widget_snapshot"}]}
    seen = []

    def request(payload):
        seen.append(payload)
        if payload["method"] == "list":
            return {"tools": [{"name": "widget_snapshot"}]}
        return response

    class Context:
        def register_middleware(self, name, callback):
            callbacks[name] = callback

    monkeypatch.setattr(plugin, "_bridge_request", request)
    plugin._register_swarm_middleware(Context(), frozenset({"kronterm_browser_navigate", "widget_snapshot"}))
    schemas = [{"function": {"name": "kronterm_browser_navigate"}}, {"name": "widget_snapshot"},
               {"function": {"name": "terminal"}}, {"name": "delegate_task"}]
    model = callbacks["llm_execution"]
    execute = callbacks["tool_execution"]
    passthrough = lambda value: value
    assert model({"tools": schemas, "parallel_tool_calls": True}, passthrough)["tools"] == schemas[:2]
    assert execute("widget_snapshot", {"blockId": "block"}, passthrough) == {"blockId": "block"}
    assert "error" in json.loads(execute("terminal", {}, passthrough))
    assert seen[0]["sessionId"] == "ui-worker"

    response = {"scope": {"swarm": True}, "tools": []}
    assert model({"tools": schemas, "tool_choice": "required"}, passthrough) == {}
    assert "error" in json.loads(execute("widget_snapshot", {}, passthrough))
    response = {"error": "authority ended"}
    assert "error" in json.loads(execute("terminal", {}, passthrough))
    response = {"scope": {"swarm": False}, "tools": [], "builtinTools": ["terminal"]}
    assert model({"tools": schemas}, passthrough)["tools"] == schemas[1:]
    assert execute("terminal", {}, passthrough) == {}
    assert "error" in json.loads(execute("kronterm_browser_navigate", {}, passthrough))


def test_coding_tools_require_a_live_grant_at_discovery_and_execution(monkeypatch):
    plugin = _load_plugin()
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: "coding-chat")
    callbacks = {}
    coding = sorted(plugin._CODING_TOOLS)
    response = {"scope": {"swarm": False}, "builtinTools": coding}

    def bridge(payload):
        return {"tools": []} if payload["method"] == "list" else response

    class Context:
        def register_middleware(self, name, callback):
            callbacks[name] = callback

    monkeypatch.setattr(plugin, "_bridge_request", bridge)
    plugin._register_swarm_middleware(Context(), frozenset())
    model, execute = callbacks["llm_execution"], callbacks["tool_execution"]
    schemas = [{"function": {"name": name}} for name in coding]
    passthrough = lambda value: value
    assert model({"tools": schemas}, passthrough)["tools"] == schemas
    for name in coding:
        assert execute(name, {"sentinel": True}, passthrough) == {"sentinel": True}

    # A scope change or a revoked worker lease must invalidate already advertised tools.
    for denied in ({"scope": {"swarm": False}, "builtinTools": []},
                   {"scope": {"swarm": False}}, {"error": "lease revoked"},
                   {"scope": {"swarm": True}, "tools": [], "builtinTools": coding}):
        response = denied
        assert model({"tools": schemas, "tool_choice": "required"}, passthrough) == {}
        for name in coding:
            assert "error" in json.loads(execute(name, {}, passthrough))


def test_profile_cached_schemas_stay_complete_and_only_live_grants_reach_the_model(monkeypatch):
    package = "kronterm_tools_profile_cache_test"
    spec = importlib.util.spec_from_file_location(
        package, PLUGIN_PATH, submodule_search_locations=[str(PLUGIN_PATH.parent)]
    )
    plugin = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, package, plugin)
    spec.loader.exec_module(plugin)
    monkeypatch.setenv("HERMES_KRONTERM_NATIVE_TOOL_URL", "http://127.0.0.1:9119/native")
    monkeypatch.setenv("KRONTERM_NATIVE_TOOL_TOKEN", "test-token")
    monkeypatch.setattr(plugin, "_runtime_identity", lambda: "")
    available = {"parent": ["widget_snapshot"], "worker": ["device_screenshot", "kron_computer_click"]}
    bridge_tools = [
        {"name": "widget_snapshot"},
        {"name": "device_screenshot"},
        {"name": "kron_computer_click"},
    ]
    guard_calls = []

    def bridge(payload):
        method = payload["method"]
        session = payload.get("sessionId")
        if method == "swarm_guard_ready":
            guard_calls.append(payload["guardVersion"])
            return {"ok": True}
        if method == "scope":
            return {
                "scope": {"swarm": session in {"planner", "worker"}},
                "tools": [{"name": name} for name in available.get(session, [])],
                "builtinTools": ["terminal"] if session == "parent" else [],
            }
        assert method == "list"
        return {"tools": [{"name": name} for name in available.get(session, [])]}

    monkeypatch.setattr(plugin, "_manifest_tools", lambda: bridge_tools)
    monkeypatch.setattr(plugin, "_bridge_request", bridge)

    class Context:
        def __init__(self):
            self.registrations = []
            self.middleware = {}

        def register_tool(self, **registration):
            # A tool owned by another plugin must not become an allowed swarm schema.
            if registration["name"] == "kron_computer_click":
                return None
            self.registrations.append(registration)
            return object()

        def register_middleware(self, name, callback):
            self.middleware.setdefault(name, []).append(callback)

        def register_hook(self, *_):
            pass

    ctx = Context()
    plugin.register(ctx)
    assert guard_calls == [1]
    assert [tool["name"] for tool in ctx.registrations] == ["widget_snapshot", "device_screenshot"]
    assert all(tool["check_fn"] is None for tool in ctx.registrations)
    cached_schemas = [
        {"function": tool["schema"]} for tool in ctx.registrations
    ] + [{"function": {"name": "terminal"}}, {"function": {"name": "kron_computer_click"}}]
    model = ctx.middleware["llm_execution"][0]
    execute = ctx.middleware["tool_execution"][0]
    passthrough = lambda value: value
    request = {"tools": cached_schemas}
    assert model(request, passthrough, session_id="parent")["tools"] == cached_schemas[:1] + cached_schemas[2:]
    assert model(request, passthrough, session_id="planner") == {}
    assert model(request, passthrough, session_id="worker")["tools"] == cached_schemas[1:2]
    assert model(request, passthrough, session_id="parent")["tools"] == cached_schemas[:1] + cached_schemas[2:]
    assert len(request["tools"]) == 4
    assert "error" in json.loads(execute("kron_computer_click", {}, passthrough, session_id="worker"))
    assert "error" in json.loads(execute("device_screenshot", {}, passthrough, session_id="parent"))
    assert execute("device_screenshot", {}, passthrough, session_id="worker") == {}

    bridge_tools.clear()
    plugin.register(Context())
    assert guard_calls == [1]
