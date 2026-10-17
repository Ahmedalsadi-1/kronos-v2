export type ComputerUseTimingOutcome = "success" | "error" | "timeout";

const SampleLimit = 128;
const KnownOperations = new Set([
    "queue",
    "startup",
    "warm",
    "call:cold",
    "call:warm",
    "sequence",
    "initialize",
    "get_app_state",
    "get_screenshot",
    "get_apps",
    "click",
    "type_text",
    "press_key",
    "scroll",
    "drag",
    "set_value",
    "perform_secondary_action",
]);

type Timing = { count: number; failures: number; timeouts: number; totalMs: number; maxMs: number; samples: number[] };

export class ComputerUseLatency {
    private timings = new Map<string, Timing>();

    record(operation: string, durationMs: number, outcome: ComputerUseTimingOutcome = "success"): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) return;
        const key = KnownOperations.has(operation) ? operation : "other";
        const timing = this.timings.get(key) ?? {
            count: 0,
            failures: 0,
            timeouts: 0,
            totalMs: 0,
            maxMs: 0,
            samples: [],
        };
        timing.count++;
        if (outcome !== "success") timing.failures++;
        if (outcome === "timeout") timing.timeouts++;
        timing.totalMs += durationMs;
        timing.maxMs = Math.max(timing.maxMs, durationMs);
        timing.samples.push(durationMs);
        if (timing.samples.length > SampleLimit) timing.samples.shift();
        this.timings.set(key, timing);
    }

    snapshot(): Record<string, unknown> {
        const round = (value: number) => Math.round(value * 100) / 100;
        return Object.fromEntries(
            [...this.timings].map(([key, timing]) => {
                const sorted = [...timing.samples].sort((a, b) => a - b);
                const percentile = (fraction: number) =>
                    round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]);
                return [
                    key,
                    {
                        count: timing.count,
                        failures: timing.failures,
                        timeouts: timing.timeouts,
                        averageMs: round(timing.totalMs / timing.count),
                        maxMs: round(timing.maxMs),
                        p50Ms: percentile(0.5),
                        p95Ms: percentile(0.95),
                        sampleCount: sorted.length,
                    },
                ];
            })
        );
    }
}
