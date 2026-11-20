import { expect, test } from "vitest";
import { AndroidVideoParser, type AndroidVideoPacket } from "./android-live-stream";

function frame(flags: bigint, data: number[]) {
    const header = Buffer.alloc(12);
    header.writeBigUInt64BE(flags);
    header.writeUInt32BE(data.length, 8);
    return Buffer.concat([header, Buffer.from(data)]);
}

test("parses split packets, preserves decoder flags and emits complete frames only", () => {
    const parser = new AndroidVideoParser();
    const packets: AndroidVideoPacket[] = [];
    const input = Buffer.concat([frame(1n << 63n, [0, 0, 1, 103]), frame((1n << 62n) | 123n, [1, 2, 3])]);
    parser.push(input.subarray(0, 13), (p) => packets.push(p));
    expect(packets).toHaveLength(0);
    parser.push(input.subarray(13, 19), (p) => packets.push(p));
    expect(packets).toHaveLength(1);
    parser.push(input.subarray(19), (p) => packets.push(p));
    expect(packets).toEqual([
        { config: true, key: false, timestamp: 0, data: "AAABZw==" },
        { config: false, key: true, timestamp: 123, data: "AQID" },
    ]);
});

test("rejects oversized video packets before buffering their payload", () => {
    const header = Buffer.alloc(12);
    header.writeUInt32BE(9 * 1024 * 1024, 8);
    expect(() => new AndroidVideoParser().push(header, () => {})).toThrow("size limit");
});
