"""Hermes registrations backed by KronTerm's TypeScript tool runtime."""

from __future__ import annotations

import hashlib
import http.client
import importlib
import io
import json
import select
from collections import OrderedDict
from concurrent.futures import Future
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
import logging
import math
import os
import re
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable

logger = logging.getLogger(__name__)

_URL_ENV = "HERMES_KRONTERM_NATIVE_TOOL_URL"
_TOKEN_ENV = "KRONTERM_NATIVE_TOOL_TOKEN"
_TOOLSET = "kronterm"
_CODING_TOOLS = frozenset({"terminal", "process_manage", "read_file", "write_file", "patch", "search_files"})
# Socket budgets include a small grace period beyond the shared server deadline.
_TIMEOUT_SECONDS = 35
_READ_TIMEOUT_SECONDS = 15
_readonly_tools: set[str] = set()
_MANIFEST_TIMEOUT_SECONDS = 15
_SWARM_SCOPE_TIMEOUT_SECONDS = 3
_MAX_OUTPUT_BYTES = 28 * 1024 * 1024
_ALIASES = {"browser_navigate": "kronterm_browser_navigate", "tool_search": "kronterm_tool_search"}
_ALLOWED_TTL_SECONDS = 1.0
_ALLOWED_FAILURE_TTL_SECONDS = 2.0
_ALLOWED_CACHE_SIZE = 64
_allowed_cache: OrderedDict[tuple[str, ...], tuple[float, frozenset[str]]] = OrderedDict()
_allowed_pending: dict[tuple[str, ...], Future[frozenset[str]]] = {}
_allowed_lock = threading.Lock()
_job_scope = ContextVar("kronterm_delegated_scope", default=None)


def _runtime_identity():
    try:
        from gateway.session_context import get_session_env
        return get_session_env("HERMES_UI_SESSION_ID", "") or get_session_env("HERMES_SESSION_ID", "")
    except ImportError:
        return ""



def _timeout_number(value: Any, default: float, minimum: float, maximum: float) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return default
    try:
        return min(maximum, max(minimum, value)) if math.isfinite(value) else default
    except OverflowError:
        return default


def _http_error_message(exc: urllib.error.HTTPError) -> str:
    try:
        body = json.loads(exc.read(64 * 1024) or b"{}")
    except (OSError, ValueError):
        body = None
    if isinstance(body, dict) and body.get("error"):
        return f"KronTerm tool bridge rejected the call ({exc.code}): {body['error']}"
    return f"KronTerm tool bridge rejected the call ({exc.code} {exc.reason})"


def _transport_failure(message: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"error": message, "failure": {"code": "TRANSPORT_FAILED", "retryable": False,
            "uncertain": payload.get("method") == "call" and payload.get("name") not in _readonly_tools}}


_MAX_IDLE_CONNECTIONS = 8
_IDLE_CONNECTION_SECONDS = 10
_idle_connections: list[tuple[tuple[str, bytes], float, http.client.HTTPConnection]] = []
_connection_lock = threading.Lock()


def _take_connection(key: tuple[str, bytes], timeout: float) -> http.client.HTTPConnection:
    connection = None
    now = time.monotonic()
    with _connection_lock:
        for index in range(len(_idle_connections) - 1, -1, -1):
            identity, expires, idle = _idle_connections[index]
            if expires <= now:
                _idle_connections.pop(index)
                idle.close()
            elif connection is None and identity == key:
                _idle_connections.pop(index)
                connection = idle
    if connection is not None:
        try:
            # An idle peer can close without sending another response.
            if connection.sock is not None and not select.select([connection.sock], [], [], 0)[0]:
                connection.sock.settimeout(timeout)
                connection.timeout = timeout
                return connection
        except (OSError, ValueError):
            pass
        connection.close()
    return http.client.HTTPConnection(key[0], timeout=timeout)


class _OversizedResponse(Exception):
    pass


@contextmanager
def _open_request(request, timeout):
    headers = dict(request.header_items())
    key = (request.host, hashlib.sha256(headers["Authorization"].encode("utf-8")).digest())
    connection = _take_connection(key, timeout)
    reusable = False
    try:
        # Never replay an ambiguous POST. Each request supplies its own authorization.
        connection.request(request.get_method(), request.selector, request.data, headers)
        with connection.getresponse() as response:
            if not 200 <= response.status < 300:
                raise urllib.error.HTTPError(
                    request.full_url, response.status, response.reason, response.headers,
                    io.BytesIO(response.read(64 * 1024)),
                )
            yield response
            if response.length:
                raise http.client.IncompleteRead(b"", response.length)
            reusable = response.isclosed() and not response.will_close and connection.sock is not None
    finally:
        if reusable:
            with _connection_lock:
                _idle_connections.append((key, time.monotonic() + _IDLE_CONNECTION_SECONDS, connection))
                if len(_idle_connections) > _MAX_IDLE_CONNECTIONS:
                    _idle_connections.pop(0)[2].close()
        else:
            connection.close()


def _bridge_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    url = os.environ.get(_URL_ENV, "").strip()
    token = os.environ.get(_TOKEN_ENV, "").strip()
    if not url or not token:
        return {"error": "KronTerm TypeScript tool bridge is unavailable"}
    try:
        endpoint = urllib.parse.urlsplit(url)
        if (endpoint.scheme != "http" or endpoint.hostname not in {"127.0.0.1", "localhost", "::1"}
                or endpoint.username or endpoint.password or endpoint.path != "/native"
                or endpoint.query or endpoint.fragment):
            return {"error": "KronTerm tool bridge must use a local HTTP /native endpoint"}
        endpoint.port
    except ValueError:
        return {"error": "Invalid KronTerm tool bridge endpoint"}
    payload = dict(payload)
    identity = _runtime_identity()
    if identity and not payload.get("sessionId"):
        payload["sessionId"] = identity
    lease = _job_scope.get()
    if lease:
        payload["delegationToken"] = lease["token"]
        if payload.get("method") in {"call", "scope"} and lease.get("track_stop"):
            from .worker_stop import child_id
            if worker := child_id.get():
                payload["childId"] = worker
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    name = payload.get("name", "")
    arguments = payload.get("arguments") or {}
    timeout = _READ_TIMEOUT_SECONDS if name in _readonly_tools else _TIMEOUT_SECONDS
    if name == "delegate_pi_coding":
        timeout = 165
    elif name == "acp_run_agent":
        timeout = _timeout_number(arguments.get("timeoutSeconds", 180), 180, 15, 600) + 10
    elif name == "n8n_run_agent":
        timeout = _timeout_number(arguments.get("timeoutSeconds", 180), 180, 15, 600) + 125
    elif name.startswith("n8n_") or name in {"swarm_start", "swarm_replan"}:
        timeout = 125
    elif name in {"workspace_design_editor_state", "workspace_design_execute", "workspace_design_read_skill", "workspace_design_save"}:
        timeout = 95
    elif name.startswith("comfyui_"):
        timeout = 40
    elif name in {"linux_desktop_start", "sandbox_task_start"}:
        timeout = 185
    elif name.startswith("sandbox_vm_"):
        timeout = 125
    elif name.startswith("kron_computer_"):
        timeout = 130
    elif name in {"linux_desktop_exec", "linux_desktop_apps", "linux_desktop_launch_app", "linux_desktop_open_url"}:
        timeout = 105
    elif name.startswith("linux_desktop_") or name == "sandbox_task_finish":
        timeout = 65
    elif name == "widget_wait_for":
        timeout = _timeout_number(arguments.get("timeoutMs", 10000), 10000, 100, 60000) / 1000 + 7
    if payload.get("method") in {"scope", "swarm_guard_ready"}:
        timeout = _SWARM_SCOPE_TIMEOUT_SECONDS
    elif payload.get("method") != "call":
        timeout = _MANIFEST_TIMEOUT_SECONDS
    try:
        with _open_request(request, timeout=timeout) as response:
            output = response.read(_MAX_OUTPUT_BYTES + 1)
            if len(output) > _MAX_OUTPUT_BYTES:
                raise _OversizedResponse
    except _OversizedResponse:
        return _transport_failure("KronTerm TypeScript tool bridge returned an oversized response", payload)
    except urllib.error.HTTPError as exc:
        message = _http_error_message(exc)
        return _transport_failure(message, payload) if exc.code >= 500 else {"error": message}
    except (OSError, http.client.HTTPException) as exc:
        return _transport_failure(f"KronTerm TypeScript tool bridge failed: {exc}", payload)
    try:
        response = json.loads(output)
    except ValueError:
        return _transport_failure("KronTerm TypeScript tool bridge returned invalid JSON", payload)
    if not isinstance(response, dict):
        return _transport_failure("KronTerm TypeScript tool bridge returned an invalid response", payload)
    return response


def _manifest_tools() -> list[Dict[str, Any]]:
    if not os.environ.get(_URL_ENV, "").strip() or not os.environ.get(_TOKEN_ENV, "").strip():
        return []
    manifest_file = os.environ.get("KRONTERM_TOOL_MANIFEST_FILE", "")
    if manifest_file:
        try:
            file = Path(manifest_file)
            if file.stat().st_size > 4 * 1024 * 1024:
                raise ValueError("Manifest exceeds the size limit")
            tools = json.loads(file.read_text(encoding="utf-8")).get("tools")
            if isinstance(tools, list):
                manifest = [tool for tool in tools if isinstance(tool, dict) and isinstance(tool.get("name"), str)]
                _readonly_tools.update(tool["name"] for tool in manifest if tool.get("annotations", {}).get("readOnlyHint") is True)
                return manifest
        except (OSError, ValueError, AttributeError):
            logger.warning("Bundled tool schemas unavailable; retrying the native manifest")
    # Registration is a startup-only sweep; a transient failure otherwise hides
    # the entire toolset until Hermes restarts.
    for attempt in range(3):
        response = _bridge_request({"method": "manifest"})
        tools = response.get("tools")
        if isinstance(tools, list):
            manifest = [tool for tool in tools if isinstance(tool, dict)]
            _readonly_tools.clear()
            _readonly_tools.update(
                tool["name"] for tool in manifest
                if isinstance(tool.get("name"), str)
                and isinstance(tool.get("annotations"), dict)
                and tool["annotations"].get("readOnlyHint") is True
            )
            return manifest
        if attempt < 2:
            time.sleep(0.25 * (attempt + 1))
    logger.warning("KronTerm native tools unavailable after startup retries: %s", response.get("error", "invalid manifest"))
    return []


def _availability_key(identity: str, task_id: str = "") -> tuple[str, ...]:
    lease = _job_scope.get()
    return (os.environ.get(_URL_ENV, "").strip(), os.environ.get(_TOKEN_ENV, "").strip(),
            identity, lease["token"] if lease else "", task_id)


def _allowed_tools(identity: str | None = None, task_id: str = "") -> frozenset[str]:
    if identity is None:
        identity = _runtime_identity()
    key = _availability_key(identity, task_id)
    with _allowed_lock:
        now = time.monotonic()
        cached = _allowed_cache.get(key)
        if cached and now < cached[0]:
            _allowed_cache.move_to_end(key)
            return cached[1]
        refresh = _allowed_pending.get(key)
        refresh_needed = refresh is None
        if refresh_needed:
            refresh = _allowed_pending[key] = Future()
    if not refresh_needed:
        return refresh.result()

    try:
        # Tool checks within one chat share a refresh without blocking other chats.
        payload = {"method": "list", "namesOnly": True}
        if identity:
            payload["sessionId"] = identity
        if task_id:
            payload["taskId"] = task_id
        tools = _bridge_request(payload).get("tools")
        valid = isinstance(tools, list)
        allowed = frozenset()
        if valid:
            allowed = frozenset(tool["name"] for tool in tools
                                if isinstance(tool, dict) and isinstance(tool.get("name"), str))
        ttl = _ALLOWED_TTL_SECONDS if valid else _ALLOWED_FAILURE_TTL_SECONDS
        with _allowed_lock:
            if _allowed_pending.get(key) is refresh:
                _allowed_cache[key] = (time.monotonic() + ttl, allowed)
                _allowed_cache.move_to_end(key)
                if len(_allowed_cache) > _ALLOWED_CACHE_SIZE:
                    _allowed_cache.popitem(last=False)
        refresh.set_result(allowed)
        return allowed
    except BaseException as exc:
        refresh.set_exception(exc)
        raise
    finally:
        with _allowed_lock:
            if _allowed_pending.get(key) is refresh:
                del _allowed_pending[key]


def _tool_allowed(name: str) -> bool:
    configured = os.environ.get(_URL_ENV, "").strip() and os.environ.get(_TOKEN_ENV, "").strip()
    return bool(configured) and name in _allowed_tools()


def _result_text(content: Iterable[Dict[str, Any]]) -> str:
    texts = [str(item.get("text", "")) for item in content if item.get("type") == "text" and item.get("text")]
    return "\n".join(texts)


def _normalize_result(response: Dict[str, Any]) -> str | Dict[str, Any]:
    if response.get("error"):
        return json.dumps({"error": str(response["error"]),
                           **({"failure": response["failure"]} if response.get("failure") else {})})
    content = response.get("content")
    if not isinstance(content, list):
        return json.dumps({"error": "KronTerm TypeScript tool returned an invalid result"})
    parts = [item for item in content if isinstance(item, dict)]
    text = _result_text(parts)
    metadata = response.get("_meta")
    metadata = metadata if isinstance(metadata, dict) else {}
    resolved_target = metadata.get("resolvedTarget")
    if resolved_target:
        text = f"{text}\n\nResolved target: {json.dumps(resolved_target)}"
    if response.get("isError"):
        return json.dumps({"error": text or "KronTerm tool call failed", "failure": metadata.get("failure")})
    images = [item for item in parts if item.get("type") == "image" and item.get("data")]
    if not images:
        if text:
            return text
        structured = response.get("structuredContent")
        return json.dumps(structured if structured is not None else {"ok": True})
    multimodal = [{"type": "text", "text": text or "KronTerm screenshot"}]
    for image in images:
        mime_type = str(image.get("mimeType") or "image/png")
        multimodal.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image['data']}"},
            }
        )
    return {"_multimodal": True, "content": multimodal, "text_summary": text or "KronTerm screenshot"}


def _handler(original_name: str, run_action=None):
    def call(args: Dict[str, Any], session_id: str | None = None, task_id: str | None = None, **_: Any) -> str | Dict[str, Any]:
        if not isinstance(args, dict):
            return json.dumps({"error": "KronTerm tool arguments must be an object matching the tool schema"})
        if original_name in {"terminal_open", "block_run_command"}:
            if args.get("visible") is not True:
                return json.dumps({"error": "Visible terminal creation requires visible=true and an explicit user request. "
                                   "Use the existing terminal tool for headless commands in its configured environment. "
                                   "Use terminal background=true and process_manage for long-running jobs. "
                                   "For assigned sandbox work, use sandbox_vm_exec. No widget was opened."})
            args = {key: value for key, value in args.items() if key != "visible"}
        if original_name == "tool_search" and isinstance(args.get("query"), str):
            args = {**args, "query": _rewrite_tool_names(args["query"], {value: key for key, value in _ALIASES.items()})}
        # The dispatcher can supply an internal engine ID that the UI never registered.
        identity = _runtime_identity() or session_id or task_id
        payload = {"method": "call", "name": original_name, "arguments": args,
                   **({"sessionId": identity} if identity else {}),
                   **({"taskId": task_id} if task_id else {})}
        response = (run_action(original_name, args, lambda: _bridge_request(payload))
                    if run_action else _bridge_request(payload))
        if original_name in {"tool_search", "app_workflow", "surface_status", "shared_skill_list", "shared_skill_read"}:
            response = _exposed_discovery_result(response, skill_result=original_name.startswith("shared_skill_"))
        if response.get("error") or response.get("isError"):
            with _allowed_lock:
                for cache_task_id in {"", task_id or ""}:
                    key = _availability_key(identity or "", cache_task_id)
                    _allowed_cache.pop(key, None)
                    _allowed_pending.pop(key, None)
        return _normalize_result(response)

    return call


def _rewrite_tool_names(text: str, names: Dict[str, str]) -> str:
    pattern = r"(?<![A-Za-z0-9_])(" + "|".join(re.escape(name) for name in names) + r")(?![A-Za-z0-9_])"
    return re.sub(pattern, lambda match: names[match.group(0)], text)


def _visible_terminal_tool(tool: Dict[str, Any]) -> Dict[str, Any]:
    if tool.get("name") not in {"terminal_open", "block_run_command"}:
        return tool
    description = ("Open a visible terminal widget only when the user explicitly requests one; requires visible=true. "
                   "For routine commands use the existing headless terminal tool, which preserves shell state. "
                   "For long-running jobs use terminal background=true and process_manage. "
                   "Respect the configured environment and use sandbox_vm_exec for assigned sandbox work. ")
    result = {**tool, "description": description + str(tool.get("description") or "")}
    schema = tool.get("inputSchema")
    if isinstance(schema, dict):
        result["inputSchema"] = {**schema, "properties": {**schema.get("properties", {}), "visible": {
            "type": "boolean", "default": False,
            "description": "Set true only when the user explicitly requested a visible terminal widget."
        }}}
    return result


def _exposed_discovery_result(response: Dict[str, Any], skill_result: bool = False) -> Dict[str, Any]:
    def rewrite(value):
        if isinstance(value, str):
            return _rewrite_tool_names(value, _ALIASES)
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        if isinstance(value, dict):
            if not skill_result and "description" in value:
                value = _visible_terminal_tool(value)
            return {key: item if key == "scope" or (skill_result and key in {"id", "name", "source"}) else rewrite(item)
                    for key, item in value.items()}
        return value

    content = response.get("content")
    parts = []
    for item in content if isinstance(content, list) else []:
        if isinstance(item, dict) and item.get("type") == "text":
            try:
                item = {**item, "text": json.dumps(rewrite(json.loads(item["text"])))}
            except (ValueError, KeyError, TypeError):
                pass
        parts.append(item)
    return {**response, **({"content": parts} if isinstance(content, list) else {}),
            **({"structuredContent": rewrite(response["structuredContent"])} if "structuredContent" in response else {})}


def _schema(tool: Dict[str, Any], exposed_name: str) -> Dict[str, Any]:
    tool = _visible_terminal_tool(tool)
    annotations = tool.get("annotations") if isinstance(tool.get("annotations"), dict) else {}
    description = str(tool.get("description") or f"Call the KronTerm {exposed_name} surface tool.")
    description = _rewrite_tool_names(description, _ALIASES)
    if annotations.get("destructiveHint") is True:
        description = f"{description} This operation can replace or delete state; inspect the target first."
    parameters = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {"type": "object"}
    return {"name": exposed_name, "description": description, "parameters": parameters}


def _register_swarm_middleware(ctx, bridge_tools):
    managed_tools = bridge_tools | _CODING_TOOLS

    def allowed_for_session(session_id, task_id, tool_name=None):
        if not os.environ.get(_URL_ENV, "").strip() or not os.environ.get(_TOKEN_ENV, "").strip():
            return False, frozenset()
        try:
            identity = _runtime_identity() or session_id
            if not identity and not task_id:
                return True, frozenset()
            response = _bridge_request({"method": "scope", "sessionId": identity, "taskId": task_id})
            scope = response.get("scope")
            scoped = scope.get("swarm") if isinstance(scope, dict) else None
            if scoped is False:
                if tool_name is not None and tool_name not in managed_tools:
                    return False, frozenset()
                builtin_tools = response.get("builtinTools")
                coding = _CODING_TOOLS.intersection(
                    name for name in builtin_tools if isinstance(name, str)
                ) if isinstance(builtin_tools, list) else frozenset()
                try:
                    names = _allowed_tools(identity, task_id)
                except Exception:
                    logger.warning("Could not list the chat's KronOS tools", exc_info=True)
                    names = frozenset()
                return False, coding | bridge_tools.intersection(_ALIASES.get(name, name) for name in names)
            tools = response.get("tools")
            if scoped is True and isinstance(tools, list):
                names = (tool["name"] for tool in tools
                         if isinstance(tool, dict) and isinstance(tool.get("name"), str))
                return True, bridge_tools.intersection(_ALIASES.get(name, name) for name in names)
        except Exception:
            logger.warning("Could not verify KronOS session tool scope", exc_info=True)
        # Hermes skips failed middleware, so an unavailable authority must return a denial.
        return True, frozenset()

    def tool_name_from_schema(tool):
        if isinstance(tool, dict):
            function = tool.get("function", tool)
            name = function.get("name") if isinstance(function, dict) else None
            if isinstance(name, str):
                return name
        return None

    def permitted(name, scoped, allowed):
        return name in allowed or (not scoped and name not in managed_tools)

    def filter_tools(request, next_call, session_id="", task_id="", **_):
        scoped, allowed = allowed_for_session(session_id, task_id)
        tools = request.get("tools")
        filtered = (
            [tool for tool in tools if permitted(tool_name_from_schema(tool), scoped, allowed)]
            if isinstance(tools, list) else []
        )
        if not scoped and (not isinstance(tools, list) or len(filtered) == len(tools)):
            return next_call(request)
        request = {**request}
        choice_name = tool_name_from_schema(request.get("tool_choice"))
        if scoped or not filtered or (choice_name and not permitted(choice_name, scoped, allowed)):
            request.pop("tool_choice", None)
        if scoped or not filtered:
            request.pop("parallel_tool_calls", None)
        if filtered:
            request["tools"] = filtered
        else:
            request.pop("tools", None)
        return next_call(request)

    def enforce(tool_name, args, next_call, session_id="", task_id="", **_):
        if not isinstance(tool_name, str):
            return json.dumps({"error": "Invalid KronOS tool name."})
        scoped, allowed = allowed_for_session(session_id, task_id, tool_name)
        if permitted(tool_name, scoped, allowed):
            return next_call(args)
        return json.dumps({"error": "This tool is outside the active KronOS tool grant."})

    ctx.register_middleware("llm_execution", filter_tools)
    ctx.register_middleware("tool_execution", enforce)


def register(ctx) -> None:
    """Register every schema exported by the TypeScript bridge."""
    if os.environ.get("KRONTERM_MANAGED_AGENT_IDENTITY") == "1":
        # Some runtime versions bind the defaults when importing the prompt builder.
        for module_name in ("agent.prompt_builder", "agent.system_prompt", "run_agent"):
            try:
                module = importlib.import_module(module_name)
            except ImportError:
                logger.debug("Agent identity module unavailable: %s", module_name)
                continue
            if hasattr(module, "DEFAULT_AGENT_IDENTITY"):
                module.DEFAULT_AGENT_IDENTITY = (
                    "You are Kron Agent, the built-in agent in KronOS. "
                    "Help the user with the workspace, coding, and automation. "
                    "Communicate clearly and verify the results of your actions."
                )
            if hasattr(module, "HERMES_AGENT_HELP_GUIDANCE"):
                module.HERMES_AGENT_HELP_GUIDANCE = ""
    middleware = callable(getattr(ctx, "register_middleware", None))
    run_action = None
    if middleware:
        from .harness import run_action, register_action_middleware, worker_budget, worker_slots

    mutations = set()
    bridge_tools = set()
    for tool in _manifest_tools():
        original_name = tool.get("name")
        if not isinstance(original_name, str) or not original_name:
            continue
        exposed_name = _ALIASES.get(original_name, original_name)
        schema = _schema(tool, exposed_name)
        registration = ctx.register_tool(
            name=exposed_name,
            toolset=_TOOLSET,
            schema=schema,
            handler=_handler(original_name, run_action),
            # Hermes caches schema availability by profile, so live chat authority belongs in middleware.
            check_fn=None if middleware else lambda name=original_name: _tool_allowed(name),
            description=schema["description"],
            emoji="🪐",
        )
        if registration is not None:
            bridge_tools.add(exposed_name)
            if original_name not in _readonly_tools:
                mutations.add(exposed_name)

    if middleware:
        from .delegation import register as register_delegation
        if os.environ.get("KRONOS_HERMES_TRACE_DB"):
            from .task_trace import register as register_task_trace
            register_task_trace(ctx, bridge_tools)
        _register_swarm_middleware(ctx, frozenset(bridge_tools))
        register_action_middleware(ctx, mutations)
        from .worker_stop import bind_worker_stop
        register_delegation(ctx, _bridge_request, _job_scope, worker_budget, bind_worker_stop, worker_slots)
        if bridge_tools:
            guard = _bridge_request({"method": "swarm_guard_ready", "guardVersion": 1})
            if guard.get("ok") is not True:
                logger.warning("The managed KronOS tool server did not acknowledge the swarm guard")
