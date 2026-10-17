// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { WshBridge } from "../src/wsh-bridge.ts";

it("keeps the event loop responsive during CLI fallback and preserves errors", async () => {
    const directory = mkdtempSync(join(tmpdir(), "kronterm-wsh-execution-"));
    const executable = join(directory, "wsh");
    writeFileSync(
        executable,
        `#!${process.execPath}\nsetTimeout(() => {\nif (process.argv.includes("setconfig")) { process.stderr.write("config rejected"); process.exitCode = 1; }\nelse process.stdout.write("widgets ready\\n");\n}, 100);\n`
    );
    chmodSync(executable, 0o700);
    class TestBridge extends WshBridge {
        protected async getSurfaceCapability() {
            return undefined;
        }
    }
    const bridge = new TestBridge();
    (bridge as unknown as { wshPath: string }).wshPath = executable;
    try {
        let completed = false;
        const result = bridge.listWidgets().then((value) => {
            completed = true;
            return value;
        });
        await nextTurn();
        assert.equal(completed, false, "CLI work must not block the event loop until completion");
        assert.equal(await result, "widgets ready");
        await assert.rejects(bridge.setConfig({ "app:layoutmode": "canvas" }), /config rejected/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

it("passes secret assignments as one argument, preserving equals and spaces", async () => {
    const bridge = new WshBridge();
    let captured: string[] = [];
    (bridge as unknown as { run: (args: string[]) => Promise<string> }).run = async (args) => {
        captured = args;
        return "ok";
    };
    await bridge.secretSet("TEST_SECRET", "a=b with spaces");
    assert.deepEqual(captured, ["secret", "set", "TEST_SECRET=a=b with spaces"]);
});
