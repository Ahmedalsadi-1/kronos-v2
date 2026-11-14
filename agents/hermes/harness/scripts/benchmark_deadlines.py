"""Compare idle pending deadlines using the legacy and shared Rust APIs.

Run npm run build:agent-harness from the repository root first, then run this
script with Python. Each JSON sample comes from a fresh process. Peak RSS is a
high-water mark, so the change may read zero if setup stays below an earlier
import peak. This measures the deadline subsystem only, without worker agents,
providers, or expiry cleanup.
"""

import argparse
import importlib.util
import json
from pathlib import Path
import resource
import statistics
import subprocess
import sys
import threading
import time


def sample(mode, count):
    path = Path(__file__).resolve().parents[2] / "plugins" / "kronterm-tools" / "harness.py"
    spec = importlib.util.spec_from_file_location("benchmark_harness", path)
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    if harness._native is None or not hasattr(harness._native, "kronos_deadline_next"):
        raise RuntimeError("Build the current native library with npm run build:agent-harness first.")
    budget_type = harness.WorkerBudget if mode == "legacy" else harness.ScheduledWorkerBudget
    baseline_threads = threading.active_count()
    baseline_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    budgets = []
    try:
        started = time.perf_counter()
        for _ in range(count):
            budget = budget_type(60_000)
            budgets.append(budget)
            budget.start(lambda: lambda: None)
        elapsed = time.perf_counter() - started
        threads = threading.active_count() - baseline_threads
        expected = count if mode == "legacy" else 1
        if threads != expected:
            raise RuntimeError(f"{mode}: expected {expected} deadline threads, found {threads}")
        peak_delta = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - baseline_rss
        return {
            "deadline_threads": threads,
            "setup_ms": round(elapsed * 1000, 3),
            "peak_rss_delta_kib": round(peak_delta / (1024 if sys.platform == "darwin" else 1), 3),
        }
    finally:
        for budget in budgets:
            budget.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--counts", nargs="+", type=int, default=[8, 64, 128])
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--sample", choices=("legacy", "shared"), help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.repetitions < 1 or any(not 1 <= count <= 128 for count in args.counts):
        parser.error("Use at least one repetition and counts between 1 and 128.")
    if args.sample:
        print(json.dumps(sample(args.sample, args.counts[0])))
        return
    for count in args.counts:
        for mode in ("legacy", "shared"):
            samples = [
                json.loads(subprocess.check_output(
                    [sys.executable, __file__, "--sample", mode, "--counts", str(count)], timeout=20
                ))
                for _ in range(args.repetitions)
            ]
            print(json.dumps({
                "scope": "idle_deadline_subsystem_only",
                "platform": sys.platform,
                "mode": mode,
                "pending_batches": count,
                "samples": samples,
                "median": {key: statistics.median(sample[key] for sample in samples) for key in samples[0]},
            }), flush=True)


if __name__ == "__main__":
    main()
