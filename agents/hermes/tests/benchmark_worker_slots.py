"""Compare isolated worker slot bookkeeping using fresh processes.

Pass the old Hermes plugins directory as --baseline. Build the release harness
for the current plugin first. This does not schedule timers or run Hermes.
"""

import argparse
import importlib.util
import json
from pathlib import Path
import statistics
import subprocess
import sys
import time

from simulate_harness import ROOT, resident_kib


def load(plugin, name):
    spec = importlib.util.spec_from_file_location(name, plugin / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample(plugins, batches, slots, native):
    plugin = plugins / "kronterm-tools"
    delegation = load(plugin, "delegation")
    harness = load(plugin, "harness")
    if harness._native is None:
        raise RuntimeError("Build the release harness for both variants.")
    make_slots = harness.worker_slots if native else None
    ids = [f"worker-fixture-{i:03}" for i in range(slots)]
    child = object()

    class Budget:
        finishes = 0

        def finish(self):
            self.finishes += 1

    budget = Budget()
    before = resident_kib()
    start = time.perf_counter()
    if make_slots is None:
        workers = [delegation.ActiveWorkers(budget, None, slots) for _ in range(batches)]
        for batch in workers:
            for key in ids:
                batch.children[key] = child
    else:
        workers = [delegation.ActiveWorkers(budget, None, slots, make_slots(slots)) for _ in range(batches)]
        if any(batch.slots is None for batch in workers):
            raise RuntimeError("Build the release library with the worker slots ABI.")
        for batch in workers:
            for key in ids:
                batch.started(key, child)
    setup = time.perf_counter() - start
    active = resident_kib()

    start = time.perf_counter()
    for batch in workers:
        for key in ids:
            if not batch.complete_slot(key):
                raise RuntimeError("Worker completion was rejected.")
    complete = time.perf_counter() - start
    if budget.finishes != batches or any(batch.children for batch in workers):
        raise RuntimeError("Worker batch failed to finish or retained a child.")
    return {
        "before_rss_kib": before, "active_rss_kib": active, "completed_rss_kib": resident_kib(),
        "active_rss_delta_kib": active - before if active is not None else None,
        "setup_ms": round(setup * 1000, 3), "completion_ms": round(complete * 1000, 3),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, type=lambda path: Path(path).resolve())
    parser.add_argument("--batches", type=int, default=128)
    parser.add_argument("--slots", type=int, default=4)
    parser.add_argument("--current", type=lambda path: Path(path).resolve(), default=ROOT / "plugins")
    parser.add_argument("--repetitions", type=int, default=7)
    parser.add_argument("--sample", choices=("baseline", "current"), help=argparse.SUPPRESS)
    args = parser.parse_args()
    if min(args.batches, args.slots, args.repetitions) < 1:
        parser.error("Counts must be positive.")
    if args.sample:
        native = args.sample == "current"
        print(json.dumps(sample(args.current if native else args.baseline, args.batches, args.slots, native)))
        return

    results = {"baseline": [], "current": []}
    for repetition in range(args.repetitions):
        modes = list(results) if repetition % 2 == 0 else list(reversed(results))
        for mode in modes:
            result = subprocess.check_output([
                sys.executable, __file__, "--sample", mode, "--baseline", str(args.baseline),
                "--current", str(args.current), "--batches", str(args.batches), "--slots", str(args.slots),
            ], timeout=30, text=True)
            results[mode].append(json.loads(result))
    for mode, samples in results.items():
        print(json.dumps({
            "variant": mode, "batches": args.batches, "slots_per_batch": args.slots, "samples": samples,
            "median": {key: statistics.median(sample[key] for sample in samples)
                       for key, value in samples[0].items() if value is not None},
        }))


if __name__ == "__main__":
    main()
