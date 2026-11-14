import { expect, it } from "vitest";
import { MjpegFrameParser } from "./mjpeg-frame-parser";

const jpeg = Buffer.from([0xff, 0xd8, 0x42, 0xff, 0xd9]);

it("handles split markers and consecutive JPEGs across every chunk boundary", () => {
    const stream = Buffer.concat([Buffer.from("headers"), jpeg, jpeg]);
    for (let size = 1; size <= stream.length; size++) {
        const parser = new MjpegFrameParser();
        const frames: Buffer[] = [];
        for (let offset = 0; offset < stream.length; offset += size) {
            parser.push(stream.subarray(offset, offset + size), (frame) => frames.push(frame));
        }
        expect(frames).toEqual([jpeg, jpeg]);
    }
});

it("drops oversized partial frames and can parse the next frame", () => {
    const parser = new MjpegFrameParser(8);
    const frames: Buffer[] = [];
    const collect = (frame: Buffer) => frames.push(frame);
    parser.push(Buffer.from([0xff, 0xd8, 1, 2, 3]), collect);
    parser.push(Buffer.concat([Buffer.from([4, 5, 6, 7, 8, 9]), jpeg]), collect);
    expect(frames).toEqual([jpeg]);
});

it("discards partial bytes at a connection boundary", () => {
    const parser = new MjpegFrameParser();
    const frames: Buffer[] = [];
    const collect = (frame: Buffer) => frames.push(frame);
    parser.push(jpeg.subarray(0, 3), collect);
    parser.reset();
    parser.push(Buffer.concat([jpeg.subarray(3), jpeg]), collect);
    expect(frames).toEqual([jpeg]);
});
