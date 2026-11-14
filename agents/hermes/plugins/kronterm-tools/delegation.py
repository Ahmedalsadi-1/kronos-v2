"""KronTerm scope leases around the official Advanced Delegation provider."""
from __future__ import annotations

from collections import OrderedDict
from contextlib import nullcontext
import importlib.util
import json
import logging
import sys
from threading import Lock
from pathlib import Path

logger = logging.getLogger(__name__)

PARENT_HANDOFF = (
    "Use the inline worker evidence in results[].summary. Check each worker's status and account for partial results. "
    "Synthesize the evidence yourself. Delegate again only for distinct work or a failed assignment whose partial changes you have checked."
)

WORKER_HANDOFF = (
    "Return the outcome, evidence you checked, and any partial changes or blocker. "
    "Finish as soon as the requested check passes or you have a concrete blocker. "
    "Inspect state before repeating an action with an uncertain outcome."
)


def _error(message):
    return json.dumps({"error": message, "retryable": False})


class ActiveWorkers:
    def __init__(self, budget, release, task_count, slots=None):
        self.budget = budget
        self.release = release
        self.children = {}
        self.slots = slots
        self.completed = set() if slots is None else None
        self.task_count = task_count
        self.lock = Lock()
        self._expired = False

    @property
    def expired(self):
        return self._expired if self.slots is None else self.slots.expired

    def started(self, identity, child):
        with self.lock:
            accepted = self.slots.start(identity) if self.slots is not None else identity not in self.completed
            if accepted:
                self.children[identity] = child

    def start(self):
        self.budget.start(self.expire)

    def expire(self):
        with self.lock:
            if self.slots is None:
                self._expired = True
            else:
                self.slots.expire()
            children = tuple(self.children.values())
        return lambda: self.interrupt_and_release(children)

    def interrupt_and_release(self, children):
        try:
            from tools.delegate_tool_registry import interrupt_subagent
            for child in children:
                try:
                    interrupt_subagent(child)
                except Exception:
                    logger.exception("Could not interrupt KronOS worker %s", child)
        finally:
            self.release()

    def finish(self):
        self.budget.finish()

    def complete_slot(self, identity, refused=False):
        with self.lock:
            if self.slots is None:
                if identity in self.completed or not refused and identity not in self.children:
                    return False
                self.completed.add(identity)
                complete = len(self.completed) >= self.task_count
            else:
                decision = self.slots.complete(identity, refused)
                if not decision:
                    return False
                complete = decision == 2
            self.children.pop(identity, None)
        if complete:
            self.finish()
        return True


def register(ctx, bridge_request, lease_context, make_budget=lambda _: None, bind_worker_stop=None,
             make_slots=lambda _: None):
    completed_assignments = OrderedDict()
    completed_lock = Lock()
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
                return "KronOS smart delegation"

            @property
            def summary(self):
                return "Advanced model routes with inherited computer scope and readiness checks."

            def settings(self, config):
                return config.get("backends", {}).get("model_map", {})

            def task_parameters(self, config):
                return {**super().task_parameters(config),
                        "scope": {"type": "string", "enum": ["sandbox", "widgets", "inherit"],
                                  "description": "sandbox: ONLY the selected VM's desktop, terminal, files and browser; widgets: only supported widgets; inherit: the parent's existing scope. Omit to choose sandbox automatically in Computer mode."},
                        "background": {"type": "boolean", "default": False,
                                       "description": "Set for every task only if this turn can finish without the results."},
                        "required_tools": {"type": "array", "items": {"type": "string"}, "maxItems": 16,
                                           "description": "Exact tools this job needs. KronOS refuses the spawn before work starts if any is unavailable."}}

            def description(self, config):
                return super().description(config) + " KronOS joins workers in this call unless each task sets background=true. Delegate bounded jobs with an exact target, success check, and stopping point. Use one sandbox task per delegation; batch only jobs with the same scope."

        ctx.register_delegation_provider(SmartDelegationProvider())
        ready = True
    except (ImportError, OSError, AttributeError) as exc:
        logger.warning("Smart delegation needs Hermes >=0.22.5 and the bundled advanced-delegation plugin: %s", exc)

    def execute(tool_name, args, next_call, session_id="", task_id="", turn_id="", **_):
        lease = lease_context.get()
        workers = lease.get("workers") if lease else None
        if workers and workers.expired:
            return _error("This worker's wall-clock budget ended. Return the verified partial result.")
        if tool_name != "delegate_task":
            return next_call(args)
        if str(args.get("action") or "").strip().lower() in {"list", "stop", "steer"}:
            return next_call(args)
        if lease_context.get():
            return _error("Only the parent may delegate. Finish this worker's assigned task and return its evidence.")
        turn = (session_id, turn_id) if session_id and turn_id else None
        if not ready:
            return _error("Smart delegation requires Hermes 0.22.5+. Prepare the managed runtime in Settings → Delegation; no worker was started.")
        dispatched = False
        finish = None
        workers = None
        try:
            from hermes_cli.config import load_config_readonly
            config = load_config_readonly() or {}
            settings = config.get("delegation") or {}
            mode = settings.get("backend", "default")
            from agent.delegation_backends import get_session_backend
            from gateway.session_context import get_session_env
            mode = get_session_backend(get_session_env("HERMES_SESSION_KEY", "") or session_id or task_id) or mode
            if mode != "kronterm_smart":
                return _error("Select KronOS smart delegation in Settings → Delegation and start a new session. Scoped jobs cannot use a different delegation backend.")
            identity = get_session_env("HERMES_UI_SESSION_ID", "") or session_id or task_id
            tasks = args.get("tasks")
            if isinstance(tasks, str):
                try:
                    tasks = json.loads(tasks)
                except ValueError:
                    return _error("tasks must be a JSON array of task objects.")
            batch = tasks is not None and tasks != []
            if tasks is None or tasks == []:
                tasks = [{"goal": args.get("goal"), "context": args.get("context"), "scope": args.get("scope"),
                          "required_tools": args.get("required_tools", [])}]
            configured_limit = settings.get("max_concurrent_children")
            limit = min(4, configured_limit) if type(configured_limit) is int and configured_limit > 0 else 4
            if not isinstance(tasks, list) or not 1 <= len(tasks) <= limit or any(not isinstance(task, dict) for task in tasks):
                return _error(f"Delegate 1 to {limit} structured tasks with the same scope.")
            if any(not isinstance(task.get("goal"), str) or not task["goal"].strip() for task in tasks):
                return _error("Each delegated task needs a concrete goal.")
            assignments = [
                (" ".join(task["goal"].split()), str(task.get("context") or "").strip())
                for task in tasks
            ]
            with completed_lock:
                if completed_assignments.get(turn, set()).intersection(assignments):
                    return _error("A requested assignment already returned evidence this turn. Reuse its result and delegate only the remaining work.")
            scopes = [task.get("scope") for task in tasks]
            if any(scope is not None and scope not in ("sandbox", "widgets", "inherit") for scope in scopes):
                return _error("Choose sandbox, widgets, or inherit as the job scope.")
            explicit_scopes = set(scopes) - {None}
            if len(explicit_scopes) > 1:
                return _error("Split jobs with different permission scopes into separate delegations.")
            delivery = {task.get("background", args.get("background")) is True for task in tasks}
            if len(delivery) != 1:
                return _error("Split inline and background jobs into separate delegations.")
            background = delivery.pop()
            required = set()
            for task in tasks:
                requested = task.get("required_tools", [])
                if not isinstance(requested, list) or len(requested) > 16 or any(not isinstance(name, str) for name in requested):
                    return _error("required_tools must contain up to 16 exact tool names.")
                required.update({"kronterm_browser_navigate": "browser_navigate",
                                 "kronterm_tool_search": "tool_search"}.get(name, name) for name in requested)
            from gateway.session_finite import finite_turn_required, finite_turn_scope
            inline = finite_turn_scope(True) if not background and finite_turn_required() is not True else nullcontext()
            grant = bridge_request({"method": "delegate_prepare", "sessionId": identity,
                                    "scope": next(iter(explicit_scopes), None),
                                    "requireDefaultScope": None in scopes and bool(explicit_scopes),
                                    "taskCount": len(tasks), "requiredTools": sorted(required)})
            if grant.get("error") or not grant.get("token"):
                return _error("Worker was not started: " + str(grant.get("error", "delegation scope unavailable")))
            finish = {"method": "delegate_finish", "delegationToken": grant["token"], "sessionId": identity}
            budget = make_budget(config)
            if budget:
                workers = ActiveWorkers(budget, lambda: bridge_request(finish), len(tasks), make_slots(len(tasks)))
            lease = {"token": grant["token"], "scope": grant["scope"], "desktopId": grant.get("desktopId"),
                     "workers": workers, "track_stop": bind_worker_stop is not None}
            scope_context = (
                f"KronOS job scope: {grant['scope']}. Use tool discovery for allowed tools. "
                f"Use the inherited computer binding and never substitute host tools for guest tools. {WORKER_HANDOFF}"
            )
            token = lease_context.set(lease)
            try:
                forwarded = {**args, "background": background}
                if batch:
                    forwarded["tasks"] = [
                        {**task, "context": f"{task.get('context', '')}\n{scope_context}"} for task in tasks
                    ]
                else:
                    forwarded.pop("tasks", None)
                    forwarded["context"] = f"{args.get('context', '')}\n{scope_context}"
                if workers:
                    workers.start()
                def cancel_child(child_id):
                    return bridge_request({**finish, "method": "delegate_cancel", "childId": child_id})

                worker_stop = bind_worker_stop(cancel_child) if bind_worker_stop else nullcontext()
                with inline, worker_stop:
                    dispatched = True
                    result = next_call(forwarded)
                try:
                    value = json.loads(result) if isinstance(result, str) else result
                except (ValueError, TypeError):
                    return result
                if isinstance(value, dict):
                    if value.get("status") == "dispatched":
                        # Refused routes never build a child and have no stop hook.
                        for entry in value.get("refused", []):
                            index = entry.get("task_index")
                            if type(index) is int and 0 <= index < len(tasks):
                                child_id = f"refused:{index}"
                                if not workers or workers.complete_slot(child_id, refused=True):
                                    bridge_request({**finish, "childId": child_id})
                    elif value.get("error") or isinstance(value.get("results"), list):
                        if workers:
                            workers.finish()
                        bridge_request(finish)
                    results = value.get("results")
                    if turn and isinstance(results, list):
                        done = set()
                        for item in results:
                            if not isinstance(item, dict) or item.get("status") != "completed" or item.get("schema_valid") is False:
                                continue
                            index = item.get("task_index", 0 if len(tasks) == 1 else None)
                            if type(index) is int and 0 <= index < len(assignments):
                                done.add(assignments[index])
                        if not done:
                            return result
                        with completed_lock:
                            completed_assignments.setdefault(turn, set()).update(done)
                            completed_assignments.move_to_end(turn)
                            if len(completed_assignments) > 512:
                                completed_assignments.popitem(last=False)
                        value = {"next_step": PARENT_HANDOFF, **value}
                        return json.dumps(value) if isinstance(result, str) else value
                return result
            finally:
                lease_context.reset(token)
        except Exception as exc:
            if not dispatched and finish is not None:
                if workers:
                    workers.finish()
                bridge_request(finish)
            # Hermes middleware falls through on exceptions; return an explicit refusal instead.
            return _error(f"Delegation failed after dispatch; inspect delegate_task action=list before retrying: {exc}" if dispatched else f"Delegation preflight failed; no worker was started: {exc}")

    def started(child_session_id="", child_subagent_id="", **_):
        lease = lease_context.get()
        workers = lease.get("workers") if lease else None
        if workers and child_subagent_id:
            workers.started(child_session_id or child_subagent_id, child_subagent_id)

    def check_model_deadline(request, next_call, session_id="", turn_id="", **_):
        lease = lease_context.get()
        workers = lease.get("workers") if lease else None
        if workers and workers.expired:
            with workers.lock:
                child = workers.children.get(session_id)
            if child:
                from tools.delegate_tool_registry import interrupt_subagent
                interrupt_subagent(child)
        with completed_lock:
            use_evidence = (session_id, turn_id) in completed_assignments
        if use_evidence:
            messages = request.get("messages")
            if isinstance(messages, list) and messages:
                first = messages[0]
                if first.get("role") == "system":
                    content = first.get("content")
                    if isinstance(content, str):
                        content = content + "\n\n" + PARENT_HANDOFF
                    elif isinstance(content, list):
                        content = [*content, {"type": "text", "text": PARENT_HANDOFF}]
                    request = {**request, "messages": [{**first, "content": content}, *messages[1:]]}
        return next_call(request)

    def stopped(child_session_id="", child_subagent_id="", **_):
        lease = lease_context.get()
        if lease and (child_subagent_id or child_session_id):
            identity = child_session_id or child_subagent_id
            workers = lease.get("workers")
            if not workers or workers.complete_slot(identity):
                bridge_request({"method": "delegate_finish", "delegationToken": lease["token"],
                                "childId": identity})

    ctx.register_middleware("tool_execution", execute)
    ctx.register_middleware("llm_execution", check_model_deadline)
    ctx.register_hook("subagent_start", started)
    ctx.register_hook("subagent_stop", stopped)
