// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { describeHermesTool, hermesToolActivityToAgentActivity, isBridgePublishedTool } from "./hermes-tool-activity";

describe("hermesToolActivityToAgentActivity", () => {
    it("maps Hermes terminal calls onto the terminal surface without leaking the full command", () => {
        const event = hermesToolActivityToAgentActivity({
            phase: "running",
            toolId: "t1",
            name: "terminal",
            args: { command: "npm test -- --secret=abc" },
            sessionId: "s1",
        });
        expect(event).toMatchObject({
            id: "hermes:t1",
            runid: "hermes:s1",
            source: "hermes",
            surface: "terminal",
            action: "type",
            phase: "running",
        });
        expect(event?.detail).toBe("terminal · npm");
    });

    it("maps file reads onto the file surface", () => {
        const event = hermesToolActivityToAgentActivity({
            phase: "succeeded",
            name: "read_file",
            args: { path: "src/app.ts" },
        });
        expect(event).toMatchObject({ surface: "file", action: "inspect", detail: "read file · src/app.ts" });
    });

    it("skips tools the KronTerm runtime already publishes precisely", () => {
        expect(hermesToolActivityToAgentActivity({ phase: "running", name: "widget_click" })).toBeNull();
        expect(hermesToolActivityToAgentActivity({ phase: "running", name: "kron_computer_click" })).toBeNull();
        expect(isBridgePublishedTool("workspace_os_action")).toBe(true);
        expect(isBridgePublishedTool("terminal")).toBe(false);
    });

    it("skips KronosCode tools, which emain publishes from ACP", () => {
        expect(
            hermesToolActivityToAgentActivity({ phase: "running", name: "read_file", agent: "kronoscode" })
        ).toBeNull();
    });
});

describe("describeHermesTool", () => {
    it("truncates long targets", () => {
        const label = describeHermesTool("web_search", { query: "x".repeat(200) });
        expect(label.length).toBeLessThanOrEqual(72);
        expect(label.endsWith("…")).toBe(true);
    });
});
