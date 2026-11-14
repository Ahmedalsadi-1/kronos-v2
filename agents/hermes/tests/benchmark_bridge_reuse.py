"""Measure actual plugin bridge requests against an HTTP/1.1 Node fixture."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import resource
import statistics
import subprocess
import sys
import tempfile
import time

from simulate_harness import resident_kib

Fixture = """
const server = require("node:http").createServer((req, res) => {
    let input = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { input += chunk; });
    req.on("end", () => {
        const payload = JSON.parse(input);
        if (req.url !== "/native" || req.headers.authorization !== "Bearer fixture" ||
            payload.method !== "call" || payload.sessionId !== `chat-${calls % 5}`) {
            res.writeHead(400).end();
            return;
        }
        calls++;
        const body = '{"content":[]}';
        res.writeHead(200, {"Content-Type": "application/json", "Content-Length": body.length});
        res.end(body);
    });
});
server.keepAliveTimeout = 60000;
let calls = 0;
let connections = 0;
server.on("connection", () => connections++);
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
process.stdin.on("data", () => console.log(JSON.stringify({calls, connections})));
"""


def measure(source, port):
    os.environ.update(HERMES_KRONTERM_NATIVE_TOOL_URL=f"http://127.0.0.1:{port}/native",
                      KRONTERM_NATIVE_TOOL_TOKEN="fixture")
    spec = importlib.util.spec_from_file_location("benchmark_plugin", source)
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)
    ready = resident_kib()
    samples = []
    for index in range(110):
        start = time.perf_counter_ns()
        result = plugin._bridge_request({"method": "call", "sessionId": f"chat-{index % 5}"})
        elapsed_ms = (time.perf_counter_ns() - start) / 1e6
        assert result == {"content": []}, result
        if index >= 10:
            samples.append(elapsed_ms)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {
        "p50_ms": statistics.median(samples),
        "p95_ms": statistics.quantiles(samples, n=20)[18],
        "total_ms": sum(samples),
        "ready_rss_kib": ready,
        "settled_rss_kib": resident_kib(),
        "peak_rss_kib": round(peak / 1024) if sys.platform == "darwin" else peak,
    }


def run_variant(source):
    with tempfile.TemporaryDirectory(prefix="kronos-bridge-bench-") as home, subprocess.Popen(
        ["node", "-e", Fixture], text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    ) as fixture:
        try:
            port = int(fixture.stdout.readline())
            env = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "TMPDIR") if key in os.environ}
            env.update(HOME=home, USERPROFILE=home, HERMES_HOME=home, HERMES_DISABLE_LAZY_INSTALLS="1")
            output = subprocess.check_output(
                [sys.executable, __file__, "--sample", str(source), str(port)],
                cwd=home, env=env, timeout=30,
            )
            fixture.stdin.write("stats\n")
            fixture.stdin.flush()
            counts = json.loads(fixture.stdout.readline())
            assert counts["calls"] == 110, counts
            return {**json.loads(output), **counts}
        finally:
            fixture.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--current", type=Path, default=Path(__file__).resolve().parents[1] / "plugins")
    parser.add_argument("--repetitions", type=int, default=6)
    parser.add_argument("--sample", nargs=2, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.sample:
        print(json.dumps(measure(*args.sample)))
        return
    if args.baseline is None or args.repetitions < 1:
        parser.error("Provide a baseline plugin directory and at least one repetition.")
    for index in range(args.repetitions):
        variants = [("baseline", args.baseline), ("current", args.current)]
        if index % 2:
            variants.reverse()
        for label, root in variants:
            source = root.resolve() / "kronterm-tools" / "__init__.py"
            print(json.dumps({"variant": label, **run_variant(source)}), flush=True)


if __name__ == "__main__":
    main()
