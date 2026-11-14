import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

SOURCE = Path(__file__).parents[1] / "plugins" / "kronterm-tools" / "task_trace.py"
SPEC = importlib.util.spec_from_file_location("task_trace_test", SOURCE)
trace = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trace)


class Context:
    def __init__(self):
        self.middleware = {}
        self.hooks = {}

    def register_middleware(self, name, callback):
        self.middleware[name] = callback

    def register_hook(self, name, callback):
        self.hooks[name] = callback


def read_trace(path):
    with sqlite3.connect(path) as connection:
        return [json.loads(row[0]) for row in connection.execute("SELECT payload FROM trace_events ORDER BY seq")]


def test_trace_is_opt_in(monkeypatch):
    monkeypatch.delenv("KRONOS_HERMES_TRACE_DB", raising=False)
    context = Context()
    trace.register(context, [])
    assert not context.hooks
    assert not context.middleware


def test_trace_correlates_lifecycle_without_persisting_payloads(monkeypatch, tmp_path):
    path = tmp_path / "trace.sqlite"
    monkeypatch.setenv("KRONOS_HERMES_TRACE_DB", str(path))
    context = Context()
    trace.register(context, ["browser_snapshot"])

    ids = {"session_id": "private-session", "turn_id": "private-turn"}
    child = {"parent_session_id": ids["session_id"], "parent_turn_id": ids["turn_id"], "child_session_id": "private-child"}
    secret = "sensitive-payload-012345"
    payload = {"prompt": secret, "token": secret, "image": secret, "reasoning": secret}
    context.hooks["pre_llm_call"](**ids, user_message=secret, conversation_history=[payload])
    assert context.middleware["llm_execution"](payload, lambda args: args, **ids, base_url=secret) is payload
    context.hooks["subagent_start"](**child, child_goal=secret)

    def raise_error(_):
        raise RuntimeError(secret)

    with pytest.raises(RuntimeError, match=secret):
        context.middleware["tool_execution"]("browser_snapshot", payload, raise_error, **ids)
    assert context.middleware["tool_execution"](secret, payload, lambda _: secret, **ids) == secret
    context.hooks["subagent_stop"](**child, child_status="completed", duration_ms=42, child_summary=secret)
    context.hooks["on_session_end"](**ids, interrupted=True, turn_exit_reason=secret)

    rows = read_trace(path)
    assert [row["event"] for row in rows] == [
        "turn_start", "llm_execution", "subagent_start", "tool_execution",
        "tool_execution", "subagent_stop", "turn_end",
    ]
    assert rows[0]["session_id"] == rows[1]["session_id"] == rows[2]["parent_session_id"] == rows[-1]["session_id"]
    assert rows[0]["turn_id"] == rows[2]["parent_turn_id"] == rows[-1]["turn_id"]
    assert rows[2]["child_session_id"] == rows[5]["child_session_id"]
    assert rows[3]["tool"] == "browser_snapshot"
    assert rows[3]["status"] == "raised"
    assert rows[4]["tool"] == "other"
    assert rows[4]["status"] == "returned"
    assert rows[5]["duration_ms"] == 42
    assert rows[-1]["status"] == "interrupted"
    for value in (secret, *ids.values(), child["child_session_id"]):
        assert value.encode() not in path.read_bytes()


def test_retention_and_write_failures_preserve_execution(monkeypatch, tmp_path):
    path = tmp_path / "trace.sqlite"
    monkeypatch.setenv("KRONOS_HERMES_TRACE_DB", str(path))
    monkeypatch.setattr(trace, "_EventLimit", 2)
    context = Context()
    trace.register(context, [])
    for _ in range(3):
        context.hooks["pre_llm_call"]()
    assert len(read_trace(path)) == 2
    with sqlite3.connect(path) as connection:
        connection.execute("DROP TABLE trace_events")
    assert context.middleware["llm_execution"]({}, lambda _: "response") == "response"
