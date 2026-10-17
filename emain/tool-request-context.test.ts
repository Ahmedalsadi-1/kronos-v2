// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";

describe("tool request context leases", () => {
    it("isolates concurrent requests and retains context through a focus change", async () => {
        const caller = { tabId: "first", capabilities: { browser: true, terminal: false, files: false, sandbox: false, computerControl: false } };
        const read = () => resolveToolRequestContext(() => ({ tabId: "fallback" }));
        const a = withToolRequestContext(caller, async () => { await Promise.resolve(); return read(); });
        const b = withToolRequestContext({ tabId: "second" }, async () => { await Promise.resolve(); return read(); });
        caller.tabId = "changed"; caller.capabilities.browser = false;
        const [first, second] = await Promise.all([a, b]);
        expect(first.tabId).toBe("first"); expect(first.capabilities.browser).toBe(true);
        expect(second.tabId).toBe("second"); expect(read().tabId).toBe("fallback");
    });

    it("does not expand an unattached caller into the fallback workspace", async () => {
        await withToolRequestContext(null, async () => {
            await Promise.resolve(); expect(resolveToolRequestContext(() => ({ tabId: "other" }))).toBeNull();
        });
    });
});
