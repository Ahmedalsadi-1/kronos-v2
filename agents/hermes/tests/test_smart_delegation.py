from contextvars import ContextVar, copy_context
import importlib.util
import json
from pathlib import Path
import sys
import types

SOURCE = Path(__file__).parents[1] / "plugins" / "kronterm-tools" / "delegation.py"


def setup(monkeypatch, bridge):
    core = types.ModuleType("agent.delegation_provider")
    core.DelegationProvider = type("DelegationProvider", (), {})
    monkeypatch.setitem(sys.modules, "agent.delegation_provider", core)
    backends = types.ModuleType("agent.delegation_backends")
    backends.get_session_backend = lambda _: None
    monkeypatch.setitem(sys.modules, "agent.delegation_backends", backends)
    session = types.ModuleType("gateway.session_context")
    session.get_session_env = lambda _, default="": default
    monkeypatch.setitem(sys.modules, "gateway.session_context", session)
    config = types.ModuleType("hermes_cli.config")
    config.load_config_readonly = lambda: {"delegation": {"backend": "kronterm_smart"}}
    monkeypatch.setitem(sys.modules, "hermes_cli.config", config)
    spec = importlib.util.spec_from_file_location("smart_delegation_test", SOURCE)
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)
    class Context:
        def register_delegation_provider(self, provider): self.provider = provider
        def register_middleware(self, _, callback): self.execute = callback
        def register_hook(self, _, callback): self.stopped = callback
    ctx = Context()
    lease = ContextVar("test_scope", default=None)
    plugin.register(ctx, bridge, lease)
    return ctx, lease


def test_no_worker_starts_when_required_tools_are_missing(monkeypatch):
    calls = []
    def bridge(payload):
        calls.append(payload)
        return {"tools": [], "scope": {"sandbox": True}} if payload["method"] == "list" else {"error": "required tool unavailable"}
    ctx, _ = setup(monkeypatch, bridge)
    result = json.loads(ctx.execute("delegate_task", {"goal": "do work"}, lambda _: (_ for _ in ()).throw(AssertionError("spawned"))))
    assert "not started" in result["error"]
    assert calls[-1]["scope"] == "sandbox"
    assert "sandbox_vm_exec" in calls[-1]["requiredTools"]


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
    result = ctx.execute("delegate_task", {"tasks": [{"scope": "sandbox"}, {"scope": "widgets"}]}, lambda _: 1 / 0)
    assert "different permission scopes" in json.loads(result)["error"]


def test_failure_after_dispatch_does_not_claim_no_worker_started(monkeypatch):
    ctx, _ = setup(monkeypatch, lambda payload: {"tools": []} if payload["method"] == "list" else {"token": "x", "scope": "inherit"})
    result = ctx.execute("delegate_task", {"goal": "work"}, lambda _: 1 / 0)
    assert "after dispatch" in json.loads(result)["error"]
