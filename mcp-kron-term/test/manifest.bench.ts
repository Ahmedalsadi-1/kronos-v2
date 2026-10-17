// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { toJSONSchema } from "zod/v4";
import { zodToJsonSchema } from "zod-to-json-schema";
import { nativeToolManifest, server } from "../src/index.js";

const Iterations = 100;
const registry = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools;

function uncachedManifest() {
    return Object.entries(registry)
        .filter(([, tool]) => tool.enabled)
        .map(([name, tool]) => ({
            name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema
                ? tool.inputSchema._zod ? toJSONSchema(tool.inputSchema) : zodToJsonSchema(tool.inputSchema._def ? tool.inputSchema : z.object(tool.inputSchema))
                : { type: "object" },
            annotations: tool.annotations,
        }));
}

function measure(operation: () => unknown) {
    const samples: number[] = [];
    for (let iteration = 0; iteration < Iterations; iteration++) {
        const start = performance.now();
        operation();
        samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    return {
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        p50Ms: samples[Math.floor(samples.length * 0.5)],
        p95Ms: samples[Math.floor(samples.length * 0.95)],
    };
}

const coldStart = performance.now();
const manifest = nativeToolManifest(() => true);
const coldMs = performance.now() - coldStart;
assert.deepEqual(manifest, uncachedManifest());
const uncached = measure(uncachedManifest);
const cached = measure(() => nativeToolManifest(() => true));
process.stdout.write(
    `${JSON.stringify({ tools: manifest.length, iterations: Iterations, coldMs, uncached, cached, speedup: uncached.meanMs / cached.meanMs }, null, 2)}\n`
);
