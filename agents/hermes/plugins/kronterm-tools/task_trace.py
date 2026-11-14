# Copyright 2026, Command Line Inc.
# SPDX-License-Identifier: Apache-2.0

"""Opt-in local trace of Hermes execution boundaries."""

import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path

_EventLimit = 4096
_Salt = os.urandom(32)
_IdentityKeys = (
    "session_id", "turn_id", "task_id", "api_request_id", "tool_call_id",
    "parent_session_id", "parent_turn_id", "child_session_id",
)
_ChildStatuses = frozenset({
    "completed", "failed", "error", "timeout", "interrupted", "cancelled", "partial",
})


def _identity(value):
    if type(value) is str and 0 < len(value) <= 256:
        return hashlib.blake2b(value.encode("utf-8", "surrogatepass"), key=_Salt, digest_size=12).hexdigest()
    return None


class TaskTrace:
    def __init__(self, path, tool_names):
        self.path = path
        self.tool_names = frozenset(tool_names) | {
            "delegate_task", "terminal", "read_file", "write_file", "patch", "search_files",
        }

    def record(self, event, context, *, status=None, duration_ms=None, tool=None):
        try:
            row = {"event": event, "time_unix_ms": time.time_ns() // 1_000_000}
            for key in _IdentityKeys:
                identity = _identity(context.get(key))
                if identity is not None:
                    row[key] = identity
            if status is not None:
                row["status"] = status
            if type(duration_ms) is int and 0 <= duration_ms <= 2**53 - 1:
                row["duration_ms"] = duration_ms
            if type(tool) is str:
                row["tool"] = tool if tool in self.tool_names else "other"
            connection = sqlite3.connect(self.path, timeout=0.01)
            try:
                with connection:
                    cursor = connection.execute("INSERT INTO trace_events(payload) VALUES (?)", (json.dumps(row),))
                    connection.execute("DELETE FROM trace_events WHERE seq <= ?", (cursor.lastrowid - _EventLimit,))
            finally:
                connection.close()
        except (OSError, sqlite3.Error):
            # Diagnostics must never alter the downstream call or delay it for a database lock.
            pass

    def execute(self, event, payload, next_call, context, tool=None):
        started = time.monotonic_ns()
        status = "raised"
        try:
            result = next_call(payload)
            status = "returned"
            return result
        finally:
            duration_ms = (time.monotonic_ns() - started) // 1_000_000
            self.record(event, context, status=status, duration_ms=duration_ms, tool=tool)

    def llm(self, request, next_call, **context):
        return self.execute("llm_execution", request, next_call, context)

    def tool(self, tool_name, args, next_call, **context):
        return self.execute("tool_execution", args, next_call, context, tool_name)

    def turn_start(self, **context):
        self.record("turn_start", context)

    def turn_end(self, completed=False, failed=False, interrupted=False, **context):
        status = "incomplete"
        if interrupted is True:
            status = "interrupted"
        elif failed is True:
            status = "failed"
        elif completed is True:
            status = "completed"
        self.record("turn_end", context, status=status)

    def child_start(self, **context):
        self.record("subagent_start", context)

    def child_stop(self, child_status=None, duration_ms=None, **context):
        status = child_status if type(child_status) is str and child_status in _ChildStatuses else "other"
        self.record("subagent_stop", context, status=status, duration_ms=duration_ms)


def register(ctx, tool_names):
    path = Path(os.environ.get("KRONOS_HERMES_TRACE_DB", ""))
    if not path.is_absolute() or not callable(getattr(ctx, "register_hook", None)):
        return
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        os.close(fd)
        connection = sqlite3.connect(path, timeout=0.01)
        try:
            connection.execute("CREATE TABLE IF NOT EXISTS trace_events (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
        finally:
            connection.close()
    except (OSError, sqlite3.Error):
        return

    trace = TaskTrace(path, tool_names)
    ctx.register_middleware("llm_execution", trace.llm)
    ctx.register_middleware("tool_execution", trace.tool)
    ctx.register_hook("pre_llm_call", trace.turn_start)
    ctx.register_hook("on_session_end", trace.turn_end)
    ctx.register_hook("subagent_start", trace.child_start)
    ctx.register_hook("subagent_stop", trace.child_stop)
