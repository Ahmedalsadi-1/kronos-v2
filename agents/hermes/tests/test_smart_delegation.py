from contextlib import nullcontext
from contextvars import ContextVar, copy_context
import importlib.util
import json
from pathlib import Path
import sys
import types

SOURCE = Path(__file__).parents[1] / "plugins" / "kronterm-tools" / "delegation.py"


def setup(monkeypatch, bridge, make_budget=lambda _: None):
    core = types.ModuleType("agent.delegation_provider")
    core.DelegationProvider = type("DelegationProvider", (), {})
    monkeypatch.setitem(sys.modules, "agent.delegation_provider", core)
    backends = types.ModuleType("agent.delegation_backends")
    backends.get_session_backend = lambda _: None
    monkeypatch.setitem(sys.modules, "agent.delegation_backends", backends)
    session = types.ModuleType("gateway.session_context")
    session.get_session_env = lambda _, default="": default
    monkeypatch.setitem(sys.modules, "gateway.session_context", session)
    finite = types.ModuleType("gateway.session_finite")
    finite.finite_turn_required = lambda: None
    finite.finite_turn_scope = lambda _: nullcontext()
    monkeypatch.setitem(sys.modules, "gateway.session_finite", finite)
    config = types.ModuleType("hermes_cli.config")
    config.load_config_readonly = lambda: {"delegation": {"backend": "kronterm_smart"}}
    monkeypatch.setitem(sys.modules, "hermes_cli.config", config)
    spec = importlib.util.spec_from_file_location("smart_delegation_test", SOURCE)
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)
    class Context:
        def register_delegation_provider(self, provider): self.provider = provider
        def register_middleware(self, name, callback):
            if name == "tool_execution":
                self.execute = callback
            elif name == "llm_execution":
                self.model = callback
        def register_hook(self, name, callback):
            setattr(self, {"subagent_start": "started", "subagent_stop": "stopped"}[name], callback)
    ctx = Context()
    lease = ContextVar("test_scope", default=None)
    plugin.register(ctx, bridge, lease, make_budget)
    return ctx, lease


def test_no_worker_starts_when_required_tools_are_missing(monkeypatch):
    calls = []
    def bridge(payload):
        calls.append(payload)
        return {"tools": [], "scope": {"sandbox": True}} if payload["method"] == "list" else {"error": "required tool unavailable"}
    ctx, _ = setup(monkeypatch, bridge)
    result = json.loads(ctx.execute("delegate_task", {"goal": "do work"}, lambda _: (_ for _ in ()).throw(AssertionError("spawned"))))
    assert "not started" in result["error"]
    assert [call["method"] for call in calls] == ["delegate_prepare"]
    assert calls[-1]["scope"] is None


def test_child_context_inherits_private_lease_and_parent_resets(monkeypatch):
    calls = []
    def bridge(payload):
        calls.append(payload)
        if payload["method"] == "list": return {"tools": [], "scope": {"sandbox": True}}
        return {"token": "private", "scope": "sandbox", "desktopId": "vm:1"}
    ctx, lease = setup(monkeypatch, bridge)
    captured = []
    def dispatch(args):
        assert lease.get()["token"] == "private"
        captured.append(copy_context())
        assert "sandbox" in args["context"]
        return '{"status":"running"}'
    ctx.execute("delegate_task", {"goal": "do work"}, dispatch)
    assert lease.get() is None
    captured[0].run(ctx.stopped, child_session_id="child:1")
    assert calls[-1] == {"method": "delegate_finish", "delegationToken": "private", "childId": "child:1"}


def test_mixed_scope_batch_is_refused_without_spawning(monkeypatch):
    ctx, _ = setup(monkeypatch, lambda _: {"tools": []})
    result = ctx.execute("delegate_task", {"tasks": [{"goal": "Check sandbox", "scope": "sandbox"}, {"goal": "Check widgets", "scope": "widgets"}]}, lambda _: 1 / 0)
    assert "different permission scopes" in json.loads(result)["error"]


def test_failure_after_dispatch_does_not_claim_no_worker_started(monkeypatch):
    ctx, _ = setup(monkeypatch, lambda payload: {"tools": []} if payload["method"] == "list" else {"token": "x", "scope": "inherit"})
    result = ctx.execute("delegate_task", {"goal": "work"}, lambda _: 1 / 0)
    assert "after dispatch" in json.loads(result)["error"]


def test_inline_result_releases_lease_even_without_stop_hook(monkeypatch):
    calls = []

    def bridge(payload):
        calls.append(payload)
        if payload["method"] == "list":
            return {"tools": []}
        return {"token": "private", "scope": "inherit"}

    ctx, _ = setup(monkeypatch, bridge)
    result = '{"results":[{"status":"completed"}]}'
    assert ctx.execute("delegate_task", {"goal": "verify"}, lambda _: result) == result
    assert calls[-1] == {"method": "delegate_finish", "delegationToken": "private", "sessionId": ""}


def test_detached_result_releases_only_refused_worker_slots(monkeypatch):
    calls = []

    def bridge(payload):
        calls.append(payload)
        if payload["method"] == "list":
            return {"tools": []}
        return {"token": "private", "scope": "inherit"}

    ctx, _ = setup(monkeypatch, bridge)
    result = '{"status":"dispatched","count":1,"refused":[{"task_index":1}]}'
    tasks = [{"goal": "verify"}, {"goal": "unavailable route"}]
    assert ctx.execute("delegate_task", {"tasks": tasks}, lambda _: result) == result
    assert calls[-1] == {"method": "delegate_finish", "delegationToken": "private", "sessionId": "", "childId": "refused:1"}


def test_deadline_stays_armed_until_all_worker_slots_finish(monkeypatch):
    class Budget:
        finished = False

        def start(self, expire):
            self.expire = expire

        def finish(self):
            self.finished = True

    budget = Budget()
    calls = []

    def bridge(payload):
        calls.append(payload)
        return {"token": "private", "scope": "inherit"}

    ctx, _ = setup(monkeypatch, bridge, lambda _: budget)

    def dispatch(_):
        ctx.started(child_session_id="fast", child_subagent_id="worker:1")
        ctx.stopped(child_session_id="fast")
        ctx.stopped(child_session_id="fast")
        ctx.stopped(child_session_id="unknown")
        assert not budget.finished
        ctx.started(child_session_id="slow", child_subagent_id="worker:2")
        ctx.stopped(child_session_id="slow")
        assert not budget.finished
        return '{"status":"dispatched","count":2,"refused":[{"task_index":2}]}'

    tasks = [{"goal": "Fast"}, {"goal": "Slow"}, {"goal": "Unavailable"}]
    assert json.loads(ctx.execute("delegate_task", {"tasks": tasks}, dispatch))["status"] == "dispatched"
    assert budget.finished
    assert [call["childId"] for call in calls if call["method"] == "delegate_finish"] == [
        "fast", "slow", "refused:2",
    ]



def test_completed_inline_batch_hands_the_turn_back_to_the_parent(monkeypatch):
    calls = []

    def bridge(payload):
        calls.append(payload["method"])
        return {"token": "private", "scope": "inherit"}

    ctx, _ = setup(monkeypatch, bridge)
    args = {"goal": "Read the requested widget"}
    result = '{"results":[{"status":"completed","summary":"17"}]}'
    ids = {"session_id": "parent", "turn_id": "turn-1"}
    first = json.loads(ctx.execute("delegate_task", args, lambda _: result, **ids))
    assert first["results"][0]["summary"] == "17"
    assert "yourself" in first["next_step"]
    second = json.loads(ctx.execute("delegate_task", args, lambda _: 1 / 0, **ids))
    assert "already returned evidence" in second["error"]
    assert calls.count("delegate_prepare") == 1

    request = {"tools": [{"function": {"name": "delegate_task"}}],
               "messages": [{"role": "system", "content": "System prompt"}]}
    guided = ctx.model(request, lambda value: value, **ids)
    assert guided["tools"] == request["tools"]
    assert first["next_step"] in guided["messages"][0]["content"]
    assert ctx.model(request, lambda value: value, session_id="parent", turn_id="turn-2") == request


def test_partial_batch_keeps_failed_assignments_available(monkeypatch):
    ctx, _ = setup(monkeypatch, lambda _: {"token": "lease", "scope": "inherit"})
    ids = {"session_id": "parent", "turn_id": "partial"}
    tasks = [{"goal": "Check the graph"}, {"goal": "Check the job result"}]
    partial = {"results": [{"task_index": 0, "status": "completed", "summary": "Graph valid"},
                           {"task_index": 1, "status": "failed", "summary": "Temporary outage"}]}
    assert "next_step" in ctx.execute("delegate_task", {"tasks": tasks}, lambda _: partial, **ids)
    repeat = ctx.execute("delegate_task", {"goal": tasks[0]["goal"]}, lambda _: 1 / 0, **ids)
    assert "already returned evidence" in json.loads(repeat)["error"]

    def dispatch(args):
        assert args["background"] is True
        return {"status": "dispatched"}

    followup = {"tasks": [{**tasks[1], "background": True}]}
    assert ctx.execute("delegate_task", followup, dispatch, **ids)["status"] == "dispatched"
