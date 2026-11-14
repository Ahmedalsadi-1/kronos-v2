"""Run the actual Hermes agent loop against deterministic loopback services.

Use the pinned Hermes venv to run this file. Pass the old plugin root as
--baseline to compare it with the current plugin in fresh Python processes.
Use --sharing to enable bridge keep-alive and compare opt-in tracing.
"""

import argparse
from collections import Counter
import ctypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import resource
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
from threading import Event, Thread
import time

ROOT = Path(__file__).resolve().parents[1]
DEADLINE = 0.7


def tool(name, arguments, step):
    return {
        "id": f"call_{step}", "type": "function",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }


def serve(scenario, keep_alive=False):
    counts = Counter()
    child_started = Event()
    lease_released = Event()
    child_started_at = []
    child_start_rss = []

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            if keep_alive:
                self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        def log_message(self, *args):
            pass

        def send_json(self, result, status=200):
            body = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            self.send_json({"data": [{"id": "fixture-model", "object": "model", "context_length": 128000}]})

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if self.path == "/native":
                if keep_alive:
                    self.protocol_version = "HTTP/1.1"
                    self.close_connection = self.headers.get("Connection", "").lower() == "close"
                    if not getattr(self, "bridge_seen", False):
                        counts["bridge_connections"] += 1
                        self.bridge_seen = True
                return self.bridge(payload)
            if self.path != "/v1/chat/completions":
                return self.send_json({"error": "unexpected endpoint"}, 404)
            user = next((m for m in payload["messages"] if m["role"] == "user"), {})
            child = "worker fixture" in str(user.get("content", "")).lower()
            actor = "child" if child else "parent"
            counts[actor] += 1
            step = counts[actor]
            if child:
                if step == 1:
                    child_start_rss.append(resident_kib())
                    child_started_at.append(time.monotonic())
                    child_started.set()
                time.sleep(0.06 if scenario != "stop" else 2)
                action = ("widget_snapshot", {"blockId": "fixture"}) if scenario == "deadline" and step <= 24 else None
                answer = "Worker verified fixture."
            elif scenario == "accuracy":
                action = (
                    ("widget_type", {"blockId": "fixture", "text": "A"}) if step <= 2 else
                    ("widget_snapshot", {"blockId": "fixture"}) if step == 3 else None
                )
                latest = next((m["content"] for m in reversed(payload["messages"]) if m["role"] == "tool"), "?")
                answer = f"Verified {latest} writes."
            else:
                action = ("delegate_task", {
                    "goal": "Worker fixture", "background": scenario != "inline",
                }) if step == 1 else None
                result = next((m["content"] for m in reversed(payload["messages"]) if m["role"] == "tool"), "{}")
                if action:
                    answer = ""
                else:
                    data = json.loads(result)
                    answer = "Worker evidence received." if data.get("results") else "Worker dispatched."
            choice = {"index": 0, "finish_reason": "tool_calls" if action else "stop"}
            message = {"role": "assistant", "content": None if action else answer}
            if action:
                message["tool_calls"] = [tool(*action, f"{actor}_{step}")]
            if payload.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                choice["delta"] = message
                try:
                    for item in (
                        {"id": "fixture", "object": "chat.completion.chunk", "created": 1,
                         "model": "fixture-model", "choices": [choice]},
                        "[DONE]",
                    ):
                        data = json.dumps(item) if isinstance(item, dict) else item
                        self.wfile.write(f"data: {data}\n\n".encode())
                except (BrokenPipeError, ConnectionResetError):
                    pass
            else:
                choice["message"] = message
                self.send_json({
                    "id": "fixture", "object": "chat.completion", "created": 1, "model": "fixture-model",
                    "choices": [choice], "usage": {"prompt_tokens": 40, "completion_tokens": 10, "total_tokens": 50},
                })

        def bridge(self, payload):
            method = payload["method"]
            counts[method] += 1
            if method == "swarm_guard_ready":
                return self.send_json({"ok": True})
            if method == "scope":
                return self.send_json({"scope": {"swarm": False}})
            if method in {"list", "delegate_prepare"}:
                time.sleep(0.025)
            if method == "list":
                return self.send_json({"tools": [{"name": "widget_type"}, {"name": "widget_snapshot"}]})
            if method == "delegate_prepare":
                return self.send_json({"token": "fixture-lease", "scope": "inherit"})
            if method == "delegate_cancel":
                return self.send_json({"pending": 0})
            if method == "delegate_finish":
                self.send_json({"ok": True})
                lease_released.set()
                return
            if method != "call":
                return self.send_json({"error": "unexpected bridge request"}, 404)
            if payload["name"] == "widget_type":
                counts["writes"] += 1
                time.sleep(0.025)
                return self.send_json({"error": "response lost after commit"}, 500)
            counts["reads"] += 1
            return self.send_json({"content": [{"type": "text", "text": str(counts["writes"])}]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    return server, counts, child_started, child_started_at, lease_released, child_start_rss


def resident_kib():
    if sys.platform == "darwin":
        proc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
        proc.proc_pidinfo.argtypes = (
            ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int,
        )
        proc.proc_pidinfo.restype = ctypes.c_int
        # PROC_PIDTASKINFO returns six uint64_t fields followed by twelve int32_t fields.
        class ProcTaskInfo(ctypes.Structure):
            _fields_ = [
                ("virtual_size", ctypes.c_uint64), ("resident_size", ctypes.c_uint64),
                ("cpu_times", ctypes.c_uint64 * 4), ("counters", ctypes.c_int32 * 12),
            ]

        info = ProcTaskInfo()
        size = ctypes.sizeof(info)
        if proc.proc_pidinfo(os.getpid(), 4, 0, ctypes.byref(info), size) != size:
            raise OSError(ctypes.get_errno(), "proc_pidinfo(PROC_PIDTASKINFO) failed")
        return info.resident_size // 1024
    if sys.platform == "linux":
        with open("/proc/self/statm", encoding="ascii") as statm:
            return int(statm.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") // 1024
    return None


def simulate(scenario, keep_alive=False):
    server, counts, started, child_started_at, lease_released, child_start_rss = serve(scenario, keep_alive)
    base = f"http://127.0.0.1:{server.server_port}"
    os.environ["HERMES_KRONTERM_NATIVE_TOOL_URL"] = f"{base}/native"
    config = Path(os.environ["HERMES_HOME"]) / "config.yaml"
    config.write_text(json.dumps({
        "plugins": {"enabled": ["kronterm-tools"]},
        "model": {"default": "fixture-model", "provider": "custom", "base_url": f"{base}/v1", "context_length": 128000},
        "delegation": {"backend": "kronterm_smart", "max_concurrent_children": 2, "max_iterations": 40,
                       "kronos_wall_timeout_seconds": DEADLINE},
        "agent": {"environment_probe": False, "reasoning_effort": "off"},
        "tools": {"tool_search": {"enabled": "off"}},
    }))
    manifest = config.with_name("manifest.json")
    manifest.write_text(json.dumps({"tools": [
        {"name": name, "description": name, "inputSchema": {"type": "object"},
         "annotations": {"readOnlyHint": name == "widget_snapshot"}}
        for name in ("widget_type", "widget_snapshot")
    ]}))
    os.environ["KRONTERM_TOOL_MANIFEST_FILE"] = str(manifest)
    from hermes_cli.plugins import discover_plugins
    from run_agent import AIAgent
    from tools.delegate_tool_registry import interrupt_subagent, list_active_subagents

    discover_plugins()
    native = next((module._native for module in sys.modules.copy().values()
                   if Path(str(getattr(module, "__file__", ""))).parts[-2:] == ("kronterm-tools", "harness.py")), None)
    if native is None:
        raise RuntimeError("Loopback benchmark requires a built KronOS native harness.")
    native_slots = hasattr(native, "kronos_slots_new")
    agent = AIAgent(
        model="fixture-model", provider="custom", api_key="fixture", base_url=f"{base}/v1", api_mode="chat_completions",
        max_iterations=10, quiet_mode=True, skip_context_files=True, skip_memory=True,
        enabled_toolsets=["kronterm", "delegation"],
    )
    assert {"widget_type", "widget_snapshot", "delegate_task"} <= set(agent.valid_tool_names), agent.valid_tool_names
    child_exited = Event()
    child_exited_at = []
    original = AIAgent.run_conversation

    def track_exit(self, *args, **kwargs):
        try:
            return original(self, *args, **kwargs)
        finally:
            if self.platform == "subagent":
                child_exited_at.append(time.monotonic())
                child_exited.set()

    AIAgent.run_conversation = track_exit
    stopped_at = []

    def stop_child():
        if started.wait(5):
            for child in list_active_subagents():
                stopped_at.append(time.monotonic())
                interrupt_subagent(child["subagent_id"])

    if scenario == "stop":
        Thread(target=stop_child, daemon=True).start()

    ready_rss = resident_kib()
    start = time.monotonic()
    result = agent.run_conversation(f"Parent fixture scenario {scenario}")
    elapsed = time.monotonic() - start
    assert result.get("completed"), result.get("error") or result.get("final_response")
    turn_end_rss = resident_kib()
    child_done = None
    if scenario != "accuracy":
        child_done = child_exited.wait(5)
        lease_released.wait(2)
        settle_by = time.monotonic() + 2
        while list_active_subagents() and time.monotonic() < settle_by:
            time.sleep(0.02)
    settled_rss = resident_kib()
    peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    trace_counts = Counter()
    trace_db = os.environ.get("KRONOS_HERMES_TRACE_DB")
    if trace_db:
        with sqlite3.connect(trace_db) as connection:
            for (payload,) in connection.execute("SELECT payload FROM trace_events"):
                trace_counts[json.loads(payload)["event"]] += 1
    print("RESULT " + json.dumps({
        "scenario": scenario, "trace_counts": dict(trace_counts), "turn_ms": round(elapsed * 1000, 3), "counts": dict(counts),
        "native_slots": native_slots,
        "ready_rss_kib": ready_rss, "turn_end_rss_kib": turn_end_rss, "settled_rss_kib": settled_rss,
        **({"child_start_rss_kib": child_start_rss[0]} if child_start_rss else {}),
        "peak_rss_kib": round(peak_rss / 1024) if sys.platform == "darwin" else peak_rss,
        "answer": result["final_response"],
        "child_exited": child_done, "active_children": len(list_active_subagents()),
        **({"worker_ms": round((child_exited_at[0] - child_started_at[0]) * 1000)} if child_exited_at else {}),
        **({"stop_to_exit_ms": round((child_exited_at[0] - stopped_at[0]) * 1000)}
           if stopped_at and child_exited_at else {}),
    }), flush=True)
    agent.close()
    server.shutdown()


def run_variant(plugins, scenario, *, keep_alive=False, trace=False):
    with tempfile.TemporaryDirectory(prefix="kronos-harness-eval-") as tmp:
        env = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "TMPDIR") if key in os.environ}
        env.update(HOME=tmp, USERPROFILE=tmp, HERMES_HOME=tmp, HERMES_DISABLE_LAZY_INSTALLS="1",
                   HERMES_PLUGINS_DEBUG="1", HERMES_BUNDLED_PLUGINS=str(plugins), KRONTERM_NATIVE_TOOL_TOKEN="fixture",
                   HERMES_TUI_TOOLSETS="kronterm,delegation")
        if trace:
            env["KRONOS_HERMES_TRACE_DB"] = str(Path(tmp) / "trace.sqlite")
        command = [sys.executable, __file__, "--scenario", scenario]
        if keep_alive:
            command.append("--sharing")
        process = subprocess.run(
            command, cwd=tmp, env=env,
            capture_output=True, text=True, timeout=40,
        )
        if process.returncode:
            raise RuntimeError(process.stdout + process.stderr)
        return next(json.loads(line.removeprefix("RESULT ")) for line in process.stdout.splitlines()
                    if line.startswith("RESULT "))


def verify(result):
    scenario = result["scenario"]
    counts = result["counts"]
    if scenario == "accuracy":
        assert counts["writes"] == counts["reads"] == 1, result
        assert result["answer"] == "Verified 1 writes.", result
        return
    assert result["child_exited"] and result["active_children"] == 0, result
    assert counts["delegate_prepare"] == 1 and counts["delegate_finish"] >= 1, result
    # The parent and child use separate cache keys, so one bridge list per turn is not expected.
    assert 1 <= counts.get("list", 0) <= 3, result
    if scenario == "inline":
        assert result["answer"] == "Worker evidence received.", result
    elif scenario == "deadline":
        assert counts["child"] < 25 and result["worker_ms"] < 1500, result
    elif scenario == "stop":
        assert result["stop_to_exit_ms"] < 1000, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=lambda path: Path(path).resolve())
    parser.add_argument("--current", type=lambda path: Path(path).resolve(), default=ROOT / "plugins")
    parser.add_argument("--sharing", action="store_true", help="Compare HTTP reuse and opt-in trace overhead.")
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--scenario", choices=("accuracy", "delegate", "inline", "deadline", "stop"))
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("Use at least one repetition.")
    if args.scenario:
        simulate(args.scenario, args.sharing)
        return
    variants = {"current": args.current}
    if args.baseline:
        variants["baseline"] = args.baseline
    if args.sharing:
        variants["trace"] = args.current
    scenarios = ("accuracy", "inline") if args.sharing else ("accuracy", "delegate", "inline", "deadline", "stop")
    items = list(variants.items())
    orders = [items[index:] + items[:index] for index in range(len(items))]
    if len(items) == 3:
        orders += [order[::-1] for order in orders]
    for scenario in scenarios:
        for repetition in range(args.repetitions):
            order = orders[repetition % len(orders)]
            for variant, plugins in order:
                result = run_variant(plugins, scenario, keep_alive=args.sharing, trace=variant == "trace")
                verify(result)
                if variant == "trace":
                    expected = {
                        "accuracy": {"turn_start": 1, "turn_end": 1, "llm_execution": 4, "tool_execution": 3},
                        "inline": {"turn_start": 2, "turn_end": 2, "llm_execution": 3, "tool_execution": 1,
                                   "subagent_start": 1, "subagent_stop": 1},
                    }
                    assert result["trace_counts"] == expected[scenario], result
                print(json.dumps({"variant": variant, **result}), flush=True)


if __name__ == "__main__":
    main()
