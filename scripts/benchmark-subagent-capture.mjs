// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const script = fileURLToPath(import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const percentile = (samples, quantile) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * quantile) - 1];

function makeFrame(sequence) {
  const width = 600;
  const height = 580;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  let state = 0x19395a7b ^ sequence;
  for (let row = 0; row < height; row++) {
    for (let col = 1; col <= width * 3; col++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels[row * (width * 3 + 1) + col] = state & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return { header, pixels };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});

function chunk(type, payload) {
  const name = Buffer.from(type);
  const bytes = Buffer.allocUnsafe(payload.length + 12);
  bytes.writeUInt32BE(payload.length);
  name.copy(bytes, 4);
  payload.copy(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

function encode({ header, pixels }) {
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function runWorker(bundle, viewers, rounds) {
  const { installSubagentSurfaceSource, subscribeSubagentSurface, publishAgentActivity, agentActivityTimeline } =
    await import(pathToFileURL(bundle));
  globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  const target = { id: "worker", sessionId: "child" };
  const activity = {
    source: "hermes",
    sessionid: "child",
    surface: "sandbox",
    surfaceid: "vm:benchmark",
    controlgeneration: 1,
    action: "inspect",
    phase: "running",
  };
  const samples = [];
  const frameHashes = [];
  let captures = 0;
  let encodedBytes = 0;
  let delivered = 0;
  let sampledPeakRss = 0;
  let idleRss;
  const warmup = 3;
  for (let round = -warmup; round < rounds; round++) {
    const fixture = makeFrame(round + warmup);
    globalThis.gc();
    if (round === -warmup) idleRss = process.memoryUsage.rss();
    const disposers = [];
    let frame;
    let received = 0;
    let timedMs;
    const start = performance.now();
    const completed = new Promise((done, fail) => {
      installSubagentSurfaceSource(async () => {
        const image = encode(fixture);
        if (round >= 0) {
          captures++;
          encodedBytes += Buffer.byteLength(image);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        return image;
      });
      for (let viewer = 0; viewer < viewers; viewer++) {
        disposers.push(
          subscribeSubagentSurface(target, ({ imageUrl, captureError }) => {
            if (captureError) fail(new Error(captureError));
            if (imageUrl == null) return;
            frame ??= imageUrl;
            if (frame !== imageUrl) fail(new Error("Viewers received different frames."));
            if (++received === viewers) {
              timedMs = performance.now() - start;
              done();
            }
          })
        );
      }
      publishAgentActivity(activity);
    });
    if (round >= 0) sampledPeakRss = Math.max(sampledPeakRss, process.memoryUsage.rss());
    const timeout = setTimeout(() => {
      throw new Error("Timed out waiting for all viewers.");
    }, 10_000);
    await completed;
    clearTimeout(timeout);
    if (round >= 0) {
      samples.push(timedMs);
      frameHashes.push(digest(frame));
      delivered += received;
    }
    disposers.forEach((dispose) => dispose());
    agentActivityTimeline.clear();
  }
  console.log(
    JSON.stringify({
      viewers,
      rounds,
      captures,
      encodedBytes,
      delivered,
      outputDigest: digest(frameHashes.join("\n")),
      idleRssBytes: idleRss,
      sampledPeakRssBytes: sampledPeakRss,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      medianMs: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      samplesMs: samples,
    })
  );
}

async function bundle(root, outfile) {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: `
                export { installSubagentSurfaceSource } from "./frontend/app/view/hermes/subagent-surface-source";
                export { subscribeSubagentSurface } from "@hermes/lib/subagent-surface";
                export { publishAgentActivity, agentActivityTimeline } from "./frontend/types/agent-activity";
            `,
      resolveDir: root,
    },
    alias: { "@hermes": resolve(root, "frontend/hermes") },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
  });
}

if (process.argv[2] === "--worker") {
  await runWorker(process.argv[3], Number(process.argv[4]), Number(process.argv[5]));
} else {
  const [baselineArg, currentArg = ".", repeatsArg = "6", roundsArg = "30"] = process.argv.slice(2);
  const repeats = Number(repeatsArg);
  const rounds = Number(roundsArg);
  if (!baselineArg || ![repeats, rounds].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error(
      "Usage: node scripts/benchmark-subagent-capture.mjs baseline-root [current-root] [repeats] [rounds]"
    );
  }
  const temp = mkdtempSync(join(tmpdir(), "subagent-capture-benchmark-"));
  try {
    const roots = { baseline: resolve(baselineArg), current: resolve(currentArg) };
    const results = [];
    const variants = Object.keys(roots);
    for (const variant of variants) await bundle(roots[variant], join(temp, variant + ".mjs"));
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const viewers of repeat % 2 ? [8, 1] : [1, 8]) {
        for (const variant of repeat % 2 ? variants.toReversed() : variants) {
          const raw = execFileSync(
            process.execPath,
            ["--expose-gc", script, "--worker", join(temp, variant + ".mjs"), viewers, rounds],
            { encoding: "utf8", timeout: 120_000 }
          );
          results.push({ repeat, variant, ...JSON.parse(raw) });
        }
      }
    }
    const frameDigest = results[0].outputDigest;
    if (results.some((r) => r.outputDigest !== frameDigest || r.delivered !== r.viewers * rounds)) {
      throw new Error("A process delivered different frame content or missed a viewer.");
    }
    console.log(
      JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, results }, null, 2)
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
