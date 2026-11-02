import assert from "node:assert/strict";
import test from "node:test";
import { descendants, parseProcesses, summarize } from "./memory.mjs";

test("memory includes backend grandchildren but excludes unrelated browser processes", () => {
    const rows = parseProcesses(
        "100 1 1000 /host\n102 101 3000 /terminal\n101 100 2000 /backend\n999 1 9000 /other-browser"
    );
    assert.deepEqual(
        descendants(rows, [100]).map((row) => row.pid),
        [100, 102, 101]
    );
});
test("explicit XPC roots include their descendants", () => {
    const rows = parseProcesses("100 1 1000 /host\n200 1 2000 /WebKit\n201 200 500 /worker");
    assert.equal(descendants(rows, [100, 200]).length, 3);
});
test("summary retains high water mark", () => {
    assert.deepEqual(summarize([{ rssMiB: 90 }, { rssMiB: 30 }, { rssMiB: 60 }]), {
        minMiB: 30,
        medianMiB: 60,
        maxMiB: 90,
        samples: 3,
    });
    assert.throws(() => summarize([]), /No memory/);
});
