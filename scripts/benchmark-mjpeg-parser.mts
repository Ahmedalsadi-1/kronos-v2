// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Run with Node 24: node --experimental-transform-types scripts/benchmark-mjpeg-parser.mts
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { MjpegFrameParser } from "../emain/device-simulator/orca-ios/mjpeg-frame-parser.ts";

const FrameCount = 300;
const FrameBytes = 512 * 1024;
const ChunkBytes = 16 * 1024;
const MaxPendingBytes = 2 * 1024 * 1024;
const JpegStart = Buffer.from([0xff, 0xd8]);
const JpegEnd = Buffer.from([0xff, 0xd9]);

type PushChunk = (chunk: Buffer, onFrame: (frame: Buffer) => void) => void;

function makeLegacyParser(): PushChunk {
    let pending: Buffer = Buffer.alloc(0);
    return (chunk, onFrame) => {
        let cursor = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
        pending = Buffer.alloc(0);
        while (cursor.length > 0) {
            const start = cursor.indexOf(JpegStart);
            if (start === -1) {
                if (cursor.at(-1) === 0xff) pending = Buffer.from([0xff]);
                return;
            }
            if (start > 0) cursor = cursor.subarray(start);
            const end = cursor.indexOf(JpegEnd, JpegStart.length);
            if (end === -1) {
                pending = Buffer.from(cursor.subarray(Math.max(0, cursor.length - MaxPendingBytes)));
                return;
            }
            const next = end + JpegEnd.length;
            onFrame(cursor.subarray(0, next));
            cursor = cursor.subarray(next);
        }
    };
}

function makeCurrentParser(): PushChunk {
    const parser = new MjpegFrameParser();
    return (chunk, onFrame) => parser.push(chunk, onFrame);
}

const fixture = Buffer.alloc(FrameBytes, 42);
JpegStart.copy(fixture);
JpegEnd.copy(fixture, FrameBytes - JpegEnd.length);
const chunks = Array.from({ length: FrameBytes / ChunkBytes }, (_, index) =>
    fixture.subarray(index * ChunkBytes, (index + 1) * ChunkBytes)
);

function run(push: PushChunk, verifyBytes = false): number {
    let count = 0;
    const onFrame = (frame: Buffer) => {
        if (verifyBytes) assert.ok(frame.equals(fixture), `Frame ${count + 1} differs from the fixture`);
        count++;
    };
    const start = performance.now();
    for (let index = 0; index < FrameCount; index++) {
        for (const chunk of chunks) push(chunk, onFrame);
    }
    const elapsed = performance.now() - start;
    assert.equal(count, FrameCount);
    return elapsed;
}

run(makeLegacyParser(), true);
run(makeCurrentParser(), true);
console.log(`Verified ${FrameCount} × ${FrameBytes / 1024} KiB frames in ${ChunkBytes / 1024} KiB chunks per parser`);
for (let trial = 1; trial <= 2; trial++) {
    const legacyMs = run(makeLegacyParser());
    const currentMs = run(makeCurrentParser());
    console.log(`Trial ${trial} | legacy ${legacyMs.toFixed(1)} ms | current ${currentMs.toFixed(1)} ms`);
}
