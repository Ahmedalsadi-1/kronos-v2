// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
    makeLspArgs,
    makeSandboxClickArgs,
    makeSandboxDragArgs,
    makeWidgetClickArgs,
    makeWidgetHoverArgs,
    makeWorkspaceSurfaceControlArgs,
    readSurfaceCapability,
    pickNewestWshBinary,
} from "../src/wsh-bridge.ts";

describe("wsh bridge command builders", () => {
    it("reads a refreshed surface capability without exposing extra fields", () => {
        const filePath = join(tmpdir(), `kronterm-surface-${process.pid}-${Date.now()}.json`);
        writeFileSync(filePath, JSON.stringify({ token: "jwt-1", tabId: "tab-1", blockId: "block-1", ignored: true }));
        assert.deepEqual(readSurfaceCapability(filePath), {
            token: "jwt-1",
            tabId: "tab-1",
            blockId: "block-1",
        });
    });

    it("rejects malformed surface capability files", () => {
        const filePath = join(tmpdir(), `kronterm-surface-invalid-${process.pid}-${Date.now()}.json`);
        writeFileSync(filePath, JSON.stringify({ tabId: "tab-1" }));
        assert.throws(() => readSurfaceCapability(filePath), /missing token or tabId/);
    });

    it("builds presentation-aware canvas geometry args without dropping zero coordinates", () => {
        assert.deepEqual(
            makeWorkspaceSurfaceControlArgs({
                action: "resize",
                blockId: "block:block-1",
                x: 0,
                y: 0,
                width: 840,
                height: 540,
            }),
            [
                "workspace-surface",
                "control",
                "resize",
                "--block",
                "block-1",
                "--x",
                "0",
                "--y",
                "0",
                "--width",
                "840",
                "--height",
                "540",
            ]
        );
    });

    it("routes HUD mode and existing-widget actions through the same authenticated surface CLI", () => {
        assert.deepEqual(makeWorkspaceSurfaceControlArgs({ action: "hud.mode", presentation: "alongside" }), [
            "workspace-surface",
            "control",
            "hud.mode",
            "--presentation",
            "alongside",
        ]);
        assert.deepEqual(makeWorkspaceSurfaceControlArgs({ action: "hud.restore", blockId: "block:browser-1" }), [
            "workspace-surface",
            "control",
            "hud.restore",
            "--block",
            "browser-1",
        ]);
    });

    it("rejects missing HUD identities, invalid placements and invalid geometry before calling wsh", () => {
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "hud.open" }), /block ID/);
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "hud.mode", presentation: "os" }), /HUD mode/);
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "move", x: Infinity }), /finite/);
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "resize", width: -1 }), /positive/);
    });

    it("builds workspace whiteboard object args", () => {
        assert.deepEqual(
            makeWorkspaceSurfaceControlArgs({
                action: "add_note",
                text: "Investigate browser flow",
                color: "amber",
                x: 0,
                y: 320,
            }),
            [
                "workspace-surface",
                "control",
                "add_note",
                "--x",
                "0",
                "--y",
                "320",
                "--text",
                "Investigate browser flow",
                "--color",
                "amber",
            ]
        );
    });

    it("passes canvas asset paths and coordinates intact to wsh", () => {
        const file = "/workspace/shot #1.mp4";
        assert.deepEqual(makeWorkspaceSurfaceControlArgs({ action: "add_file", file, x: 0, y: -10 }), [
            "workspace-surface",
            "control",
            "add_file",
            "--x",
            "0",
            "--y",
            "-10",
            "--file",
            file,
        ]);
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "add_file" }), /absolute local file path/);
        assert.throws(() => makeWorkspaceSurfaceControlArgs({ action: "add_file", file, x: Infinity }), /finite/);
    });

    it("builds typed OS docking and workspace args", () => {
        assert.deepEqual(
            makeWorkspaceSurfaceControlArgs({
                action: "spatial.dock",
                blockId: "block:hermes-1",
                targetBlockId: "browser-1",
                side: "right",
                workspaceId: "workspace-2",
            }),
            [
                "workspace-surface",
                "control",
                "spatial.dock",
                "--block",
                "hermes-1",
                "--target-block",
                "browser-1",
                "--side",
                "right",
                "--workspace",
                "workspace-2",
            ]
        );
    });

    it("builds scoped LSP query args with bounded position options", () => {
        assert.deepEqual(makeLspArgs("/workspace", "src/main.go", "go", "definition", 4, 8, 25), [
            "lsp",
            "/workspace",
            "src/main.go",
            "go",
            "definition",
            "--line",
            "4",
            "--character",
            "8",
            "--max-results",
            "25",
        ]);
    });

    it("builds widget click args for element refs", () => {
        assert.deepEqual(makeWidgetClickArgs("abc123", "@e3", undefined, undefined, "right", "double"), [
            "-b",
            "block:abc123",
            "widget",
            "click",
            "--element-ref",
            "@e3",
            "--button",
            "right",
            "--click-type",
            "double",
        ]);
    });

    it("builds widget click args for coordinates", () => {
        assert.deepEqual(makeWidgetClickArgs("block:abc123", undefined, 40, 50, "left", "single"), [
            "-b",
            "block:abc123",
            "widget",
            "click",
            "--x",
            "40",
            "--y",
            "50",
            "--button",
            "left",
            "--click-type",
            "single",
        ]);
    });

    it("rejects widget clicks without a target", () => {
        assert.throws(
            () => makeWidgetClickArgs("abc123"),
            /widget click requires exactly one target: elementRef or both x and y/
        );
    });

    it("rejects widget clicks with ambiguous targets", () => {
        assert.throws(
            () => makeWidgetClickArgs("abc123", "@e3", 40, 50),
            /widget click requires exactly one target: elementRef or both x and y/
        );
    });

    it("rejects widget clicks with partial coordinates", () => {
        assert.throws(() => makeWidgetClickArgs("abc123", undefined, 40), /widget click requires both x and y/);
    });

    it("builds widget mouse move args through the hover route", () => {
        assert.deepEqual(makeWidgetHoverArgs("abc123", undefined, 60, 70), [
            "-b",
            "block:abc123",
            "widget",
            "hover",
            "--x",
            "60",
            "--y",
            "70",
        ]);
    });

    it("builds sandbox click args with coordinates and count", () => {
        assert.deepEqual(makeSandboxClickArgs("default", 120, 80, "left", 2), [
            "sandbox",
            "--session-id",
            "default",
            "click",
            "--at",
            "--x",
            "120",
            "--y",
            "80",
            "--button",
            "left",
            "--count",
            "2",
        ]);
    });

    it("builds sandbox drag args for the bytebot-backed CLI route", () => {
        assert.deepEqual(makeSandboxDragArgs("s1", 1, 2, 3, 4, "middle"), [
            "sandbox",
            "--session-id",
            "s1",
            "drag",
            "1",
            "2",
            "3",
            "4",
            "--button",
            "middle",
        ]);
    });
});

describe("pickNewestWshBinary", () => {
    it("prefers the newest mtime among build candidates", () => {
        const dir = join(tmpdir(), `kronterm-wsh-resolve-${process.pid}-${Date.now()}`);
        mkdirSync(dir, { recursive: true });
        const stale = join(dir, "wsh");
        const fresh = join(dir, "wsh-0.14.3-darwin.arm64");
        writeFileSync(stale, "#!/bin/sh\n");
        writeFileSync(fresh, "#!/bin/sh\n");
        utimesSync(stale, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
        utimesSync(fresh, new Date(), new Date());
        assert.equal(pickNewestWshBinary([stale, fresh]), fresh);
        rmSync(dir, { recursive: true, force: true });
    });

    it("skips missing candidates", () => {
        assert.equal(pickNewestWshBinary(["/nonexistent/wsh", "/also/missing"]), undefined);
    });
});
