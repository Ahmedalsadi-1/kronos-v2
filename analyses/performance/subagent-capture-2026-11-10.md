# Subagent screenshot sharing, 2026-11-10

This benchmark runs the real subagent surface source in a Node fixture. It measures the effect of sharing one in-flight capture across subscriptions for the same worker and activity event.

Each process runs three warmup rounds and 30 measured rounds. Each round subscribes one or eight viewers, publishes a new inspect event, waits for all viewers, then disposes them and clears the timeline. The capture callback compresses a seeded 600 × 580 RGB image into a valid PNG, encodes it as a base64 data URL, and adds a 5 ms async delay. Seeded high-entropy pixels make this a stress fixture for duplicate encoding and resident memory; real screenshots vary in compressibility. Pixel generation, forced GC, and output verification are outside the latency interval.

The runner alternates baseline/current and viewer-count order across six repetitions, launching a fresh process for every case. Bundling happens outside those processes. The memory figure is the median of the OS-reported lifetime RSS high-water mark (`process.resourceUsage().maxRSS`, converted from KiB to MiB). Raw output also records RSS before the first dispatch and the maximum of samples taken just after dispatch. Latency runs from subscription setup through delivery to the last viewer. The table reports medians of each process's p50 and p95, respectively.

| Viewers | Version | Captures / 30 events | Delivered | Encoded MiB | Peak RSS MiB | p50 ms | p95 ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | baseline | 30 | 30 | 39.9 | 92.4 | 30.26 | 42.78 |
| 1 | current | 30 | 30 | 39.9 | 88.1 | 30.05 | 40.40 |
| 8 | baseline | 240 | 240 | 318.9 | 163.8 | 191.97 | 247.60 |
| 8 | current | 30 | 240 | 39.9 | 92.5 | 29.66 | 32.28 |

With eight viewers, shared capture reduced duplicate requests by 87.5%, lowered median peak RSS by 71.3 MiB (44%), and delivered all frames 6.47× as fast in this fixture. A single viewer showed no comparable gain.

[Raw process and round samples](subagent-capture-2026-11-10.json).

All runs delivered every expected frame and had the same SHA-256 digest over the sequence of frame digests. The surface-source test suite passed 14 cases, including viewer close, session/surface/control-generation changes, and preventing an older capture from replacing newer tool evidence. Closing a subscriber drops delivery to that viewer; it does not abort a capture already started.

This measures Node process RSS and delivery latency with synthetic capture work. It does not measure Electron or VM RSS, native capture/IPC latency, compositor or decode costs, or production frame throughput. The callback count measures redundant requests at the renderer source boundary.

Reproduce from the measured current source in the repository root (macOS 26.1 arm64, Node v24.13.0 in this run). The reverse patch reconstructs the pre-change source without requiring the original scratch checkout.

```sh
baseline="$(mktemp -d)"
for file in frontend/app/view/hermes/subagent-surface-source.ts \
            frontend/hermes/lib/subagent-surface.ts \
            frontend/types/agent-activity.ts; do
    mkdir -p "$baseline/$(dirname "$file")"
    cp "$file" "$baseline/$file"
done
patch -s -d "$baseline" -p1 < analyses/performance/subagent-capture-baseline-2026-11-10.patch
node scripts/benchmark-subagent-capture.mjs "$baseline" . 6 30
```

Measured source SHA-256: baseline `b2189a1b6a2d815863238cf557d8e9f4418c61e4e92c5a7397ebea87d20a4567`; current `7baf7db0fce3bfc8377ee8780584b55b9b84bd6db9d576644d193f79e79a357d`. The subscription and activity modules were identical in both inputs.
