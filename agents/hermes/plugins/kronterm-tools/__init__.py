"""Hermes registrations backed by KronTerm's TypeScript tool runtime."""

from __future__ import annotations

import json
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
# Socket budgets include a small grace period beyond the shared server deadline.
_TIMEOUT_SECONDS = 35
_READ_TIMEOUT_SECONDS = 15
_readonly_tools: set[str] = set()
_MANIFEST_TIMEOUT_SECONDS = 15
_MAX_OUTPUT_BYTES = 28 * 1024 * 1024
_ALIASES = {"browser_navigate": "kronterm_browser_navigate", "tool_search": "kronterm_tool_search"}
_ALLOWED_TTL_SECONDS = 1.0
_ALLOWED_FAILURE_TTL_SECONDS = 2.0
_allowed_ttl = _ALLOWED_TTL_SECONDS
_allowed_cache: tuple[float, frozenset[str]] | None = None
_allowed_bridge: tuple[str, str] | None = None
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


class _LocalBridgeRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _open_request(request, timeout):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _LocalBridgeRedirects())
    return opener.open(request, timeout=timeout)


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
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    name = payload.get("name", "")
    arguments = payload.get("arguments") or {}
    timeout = _READ_TIMEOUT_SECONDS if name in _readonly_tools else _TIMEOUT_SECONDS
    if name == "acp_run_agent":
        timeout = _timeout_number(arguments.get("timeoutSeconds", 180), 180, 15, 600) + 10
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
    if payload.get("method") != "call":
        timeout = _MANIFEST_TIMEOUT_SECONDS
    try:
        with _open_request(request, timeout=timeout) as response:
            output = response.read(_MAX_OUTPUT_BYTES + 1)
    except urllib.error.HTTPError as exc:
        message = _http_error_message(exc)
        return _transport_failure(message, payload) if exc.code >= 500 else {"error": message}
    except (OSError, urllib.error.URLError) as exc:
        return _transport_failure(f"KronTerm TypeScript tool bridge failed: {exc}", payload)
    if len(output) > _MAX_OUTPUT_BYTES:
        return _transport_failure("KronTerm TypeScript tool bridge returned an oversized response", payload)
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


def _allowed_tools() -> frozenset[str]:
    """Tools enabled for the active workspace, fetched with one bridge call and cached briefly.

    Hermes probes every tool's check_fn when it builds a turn; one subprocess per tool
    made the whole toolset flap as unavailable under load.
    """
    # Parallel tool checks share one refresh instead of flooding Electron on expiry.
    with _allowed_lock:
        return _refresh_allowed_tools()


def _refresh_allowed_tools() -> frozenset[str]:
    global _allowed_cache, _allowed_bridge, _allowed_ttl
    lease = _job_scope.get()
    bridge = (os.environ.get(_URL_ENV, "").strip(), os.environ.get(_TOKEN_ENV, "").strip(),
              _runtime_identity(), lease["token"] if lease else "")
    if bridge != _allowed_bridge:
        _allowed_cache = None
        _allowed_bridge = bridge
    now = time.monotonic()
    if _allowed_cache is not None and now - _allowed_cache[0] < _allowed_ttl:
        return _allowed_cache[1]
    response = _bridge_request({"method": "list"})
    tools = response.get("tools")
    if not isinstance(tools, list):
        _allowed_ttl = _ALLOWED_FAILURE_TTL_SECONDS
        _allowed_cache = (now, frozenset())
        return frozenset()
    allowed = frozenset(str(tool.get("name")) for tool in tools if isinstance(tool, dict) and tool.get("name"))
    _allowed_ttl = _ALLOWED_TTL_SECONDS
    _allowed_cache = (now, allowed)
    return allowed


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


def _handler(original_name: str):
    def call(args: Dict[str, Any], session_id: str | None = None, task_id: str | None = None, **_: Any) -> str | Dict[str, Any]:
        global _allowed_cache
        if not isinstance(args, dict):
            return json.dumps({"error": "KronTerm tool arguments must be an object matching the tool schema"})
        if original_name == "tool_search" and isinstance(args.get("query"), str):
            args = {**args, "query": _rewrite_tool_names(args["query"], {value: key for key, value in _ALIASES.items()})}
        # Dispatcher context, rather than model arguments, selects the owning chat.
        identity = session_id or task_id
        response = _bridge_request({"method": "call", "name": original_name, "arguments": args,
                                    **({"sessionId": identity} if identity else {}),
                                    **({"taskId": task_id} if task_id else {})})
        if original_name in {"tool_search", "app_workflow", "surface_status"}:
            response = _exposed_discovery_result(response)
        if response.get("error") or response.get("isError"):
            _allowed_cache = None
        return _normalize_result(response)

    return call


def _rewrite_tool_names(text: str, names: Dict[str, str]) -> str:
    pattern = r"(?<![A-Za-z0-9_])(" + "|".join(re.escape(name) for name in names) + r")(?![A-Za-z0-9_])"
    return re.sub(pattern, lambda match: names[match.group(0)], text)


def _exposed_discovery_result(response: Dict[str, Any]) -> Dict[str, Any]:
    def rewrite(value):
        if isinstance(value, str):
            return _rewrite_tool_names(value, _ALIASES)
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        if isinstance(value, dict):
            return {key: rewrite(item) for key, item in value.items()}
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
    annotations = tool.get("annotations") if isinstance(tool.get("annotations"), dict) else {}
    description = str(tool.get("description") or f"Call the KronTerm {exposed_name} surface tool.")
    description = _rewrite_tool_names(description, _ALIASES)
    if annotations.get("destructiveHint") is True:
        description = f"{description} This operation can replace or delete state; inspect the target first."
    parameters = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {"type": "object"}
    return {"name": exposed_name, "description": description, "parameters": parameters}


def register(ctx) -> None:
    """Register every schema exported by the TypeScript bridge."""
    for tool in _manifest_tools():
        original_name = tool.get("name")
        if not isinstance(original_name, str) or not original_name:
            continue
        exposed_name = _ALIASES.get(original_name, original_name)
        ctx.register_tool(
            name=exposed_name,
            toolset=_TOOLSET,
            schema=_schema(tool, exposed_name),
            handler=_handler(original_name),
            check_fn=lambda name=original_name: _tool_allowed(name),
            description=_rewrite_tool_names(str(tool.get("description") or ""), _ALIASES),
            emoji="🪐",
        )

    if callable(getattr(ctx, "register_middleware", None)):
        from .delegation import register as register_delegation
        register_delegation(ctx, _bridge_request, _job_scope)
