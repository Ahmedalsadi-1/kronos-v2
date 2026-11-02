"""KronTerm scope leases around the official Advanced Delegation provider."""
from __future__ import annotations

import importlib.util
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _error(message):
    return json.dumps({"error": message, "retryable": False})


def register(ctx, bridge_request, lease_context):
    ready = False
    try:
        from agent.delegation_provider import DelegationProvider
        source = Path(__file__).parent.parent / "advanced-delegation" / "model_map.py"
        name = "_kronterm_official_model_map"
        spec = importlib.util.spec_from_file_location(name, source)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)

        class SmartDelegationProvider(module.ModelMapDelegationProvider):
            @property
            def name(self):
                return "kronterm_smart"

            @property
            def display_name(self):
                return "KronTerm smart delegation"

            @property
            def summary(self):
                return "Advanced model routes with inherited computer scope and readiness checks."

            def settings(self, config):
                return config.get("backends", {}).get("model_map", {})

            def task_parameters(self, config):
                return {**super().task_parameters(config),
                        "scope": {"type": "string", "enum": ["sandbox", "widgets", "inherit"],
                                  "description": "sandbox: ONLY the selected VM's desktop, terminal, files and browser; widgets: only supported widgets; inherit: the parent's existing scope. Omit to choose sandbox automatically in Computer mode."},
                        "required_tools": {"type": "array", "items": {"type": "string"}, "maxItems": 16,
                                           "description": "Exact tools this job needs. KronTerm refuses the spawn before work starts if any is unavailable."}}

            def description(self, config):
                return super().description(config) + " Set an explicit scope for specialist jobs. A sandbox worker never receives host shell/files/desktop access. Use one sandbox task per delegation; batch only jobs with the same scope."

        ctx.register_delegation_provider(SmartDelegationProvider())
        ready = True
    except (ImportError, OSError, AttributeError) as exc:
        logger.warning("Smart delegation needs Hermes >=0.22.5 and the bundled advanced-delegation plugin: %s", exc)

    def execute(tool_name, args, next_call, session_id="", task_id="", **_):
        if tool_name != "delegate_task":
            return next_call(args)
        if args.get("action") in {"list", "stop", "steer"}:
            return next_call(args)
        if not ready:
            return _error("Smart delegation requires Hermes 0.22.5+. Prepare the managed runtime in Settings → Delegation; no worker was started.")
        dispatched = False
        try:
            from hermes_cli.config import load_config_readonly
            config = load_config_readonly() or {}
            mode = (config.get("delegation") or {}).get("backend", "default")
            from agent.delegation_backends import get_session_backend
            from gateway.session_context import get_session_env
            mode = get_session_backend(get_session_env("HERMES_SESSION_KEY", "") or session_id or task_id) or mode
            if mode != "kronterm_smart":
                return _error("Select KronTerm smart delegation in Settings → Delegation and start a new session. Scoped jobs cannot use a different delegation backend.")
            listing = bridge_request({"method": "list", "sessionId": session_id or task_id})
            if listing.get("error") or not isinstance(listing.get("tools"), list):
                return _error("Delegation preflight could not verify tools: " + str(listing.get("error", "invalid manifest")))
            inherited = lease_context.get()
            default_scope = inherited["scope"] if inherited else "sandbox" if listing.get("scope", {}).get("sandbox") else "inherit"
            tasks = args.get("tasks") or [{"goal": args.get("goal", "")}]
            if not isinstance(tasks, list) or not tasks or len(tasks) > 4 or any(not isinstance(task, dict) for task in tasks):
                return _error("Delegate 1–4 structured tasks with the same scope.")
            scopes = {task.get("scope") or default_scope for task in tasks}
            if len(scopes) != 1:
                return _error("Split jobs with different permission scopes into separate delegations.")
            scope = scopes.pop()
            if scope not in {"sandbox", "widgets", "inherit"}:
                return _error("Choose sandbox, widgets, or inherit as the job scope.")
            if scope != "inherit" and mode == "profile_routes":
                return _error("Scoped jobs use Advanced Delegation model routes. Profile routes can change terminal policy; select KronTerm smart delegation for this job.")
            required = []
            for task in tasks:
                requested = task.get("required_tools", [])
                if not isinstance(requested, list) or len(requested) > 16 or any(not isinstance(name, str) for name in requested):
                    return _error("required_tools must contain up to 16 exact tool names.")
                required.extend(requested)
            if scope == "sandbox":
                required.extend(["sandbox_vm_status", "sandbox_vm_exec", "sandbox_vm_files", "sandbox_vm_browser", "sandbox_vm_desktop"])
            elif scope == "widgets":
                required.extend(["widget_snapshot", "widget_click"])
            grant = bridge_request({"method": "delegate_prepare", "sessionId": session_id or task_id,
                                    "scope": scope, "taskCount": len(tasks), "requiredTools": sorted(set(required))})
            if grant.get("error") or not grant.get("token"):
                return _error("Worker was not started: " + str(grant.get("error", "delegation scope unavailable")))
            lease = {"token": grant["token"], "scope": grant["scope"], "desktopId": grant.get("desktopId")}
            token = lease_context.set(lease)
            try:
                forwarded = dict(args)
                if args.get("tasks"):
                    forwarded["tasks"] = [{**task, "context": f"{task.get('context', '')}\nKronTerm job scope: {grant['scope']}. Use tool_search for this worker's allowed tools. VM binding is inherited; never substitute host tools."} for task in tasks]
                else:
                    forwarded["context"] = f"{args.get('context', '')}\nKronTerm job scope: {grant['scope']}. The worker must remain inside its inherited scope."
                dispatched = True
                result = next_call(forwarded)
                try:
                    value = json.loads(result) if isinstance(result, str) else result
                    if isinstance(value, dict) and value.get("error"):
                        bridge_request({"method": "delegate_finish", "delegationToken": grant["token"]})
                except (ValueError, TypeError):
                    pass
                return result
            finally:
                lease_context.reset(token)
        except Exception as exc:
            # Hermes middleware falls through on exceptions; return an explicit refusal instead.
            return _error(f"Delegation failed after dispatch; inspect delegate_task action=list before retrying: {exc}" if dispatched else f"Delegation preflight failed; no worker was started: {exc}")

    def stopped(child_session_id="", child_subagent_id="", **_):
        lease = lease_context.get()
        if lease:
            bridge_request({"method": "delegate_finish", "delegationToken": lease["token"],
                            "childId": child_subagent_id or child_session_id})

    ctx.register_middleware("tool_execution", execute)
    ctx.register_hook("subagent_stop", stopped)
