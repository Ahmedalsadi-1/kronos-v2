// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reusableTerminal } from "../src/terminal-reuse.ts";
import { WshBridge } from "../src/wsh-bridge.ts";

describe("terminal reuse", () => {
    it("prefers a focused local shell without reusing remote or command blocks", () => {
        const blocks = [
            { blockid: "remote", view: "term", focused: true, meta: { controller: "shell", connection: "ssh:server" } },
            { blockid: "command", view: "term", meta: { controller: "cmd", cmd: "npm test" } },
            { blockid: "first", view: "term", meta: { controller: "shell", "cmd:cwd": "/one" } },
            { blockid: "focused", focused: true, meta: { view: "term", controller: "shell", "cmd:cwd": "/two" } },
        ];
        assert.equal(reusableTerminal(blocks), "focused");
        assert.equal(reusableTerminal(blocks, "/one"), "first");
        assert.equal(reusableTerminal(blocks, "/missing"), undefined);
    });

    it("serializes overlapping opens and cleans up failed operations", async () => {
        class Bridge extends WshBridge {
            queue(key: string, operation: () => Promise<string>) {
                return this.serializeTerminalOpen(key, operation);
            }
        }
        const bridge = new Bridge();
        let release: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const order: number[] = [];
        const first = bridge.queue("tab", async () => {
            order.push(1);
            await gate;
            return "one";
        });
        const second = bridge.queue("tab", async () => {
            order.push(2);
            return "two";
        });
        assert.deepEqual(order, [1]);
        assert.equal(await bridge.queue("another-tab", async () => "independent"), "independent");
        release();
        assert.deepEqual(await Promise.all([first, second]), ["one", "two"]);
        assert.deepEqual(order, [1, 2]);
        await assert.rejects(
            bridge.queue("tab", async () => {
                throw Error("failure");
            })
        );
        assert.equal(await bridge.queue("tab", async () => "recovered"), "recovered");
    });
});

describe("CLI terminal ownership", () => {
    it("lists only the owning tab and permits the first terminal in an empty tab", async () => {
        class Bridge extends WshBridge {
            calls: string[] = [];
            protected async getSurfaceCapability(): Promise<any> {
                return { tabId: "owner" };
            }
            async listBlocks(tabId?: string): Promise<string> {
                this.calls.push(String(tabId));
                return "No blocks found";
            }
        }
        const bridge = new Bridge();
        (bridge as any).run = async (args: string[]) => {
            bridge.calls.push(args[0]);
            return "created";
        };
        assert.equal(await bridge.openTerminal("/project"), "created");
        assert.deepEqual(bridge.calls, ["owner", "term"]);
    });
});
