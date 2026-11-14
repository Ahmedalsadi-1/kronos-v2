// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectRoomService } from "../../../../../emain/project-room-service";
import { launchVerificationServer, runControlOmb } from "../../scripts/control-omb.ts";
import { request } from "../../scripts/mcp-server.ts";
import { readHandoffs } from "../testing/handoff-rows.ts";

it("runs the native project team through real durable handoffs and retains shared outputs after reopening", async () => {
    const session = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true });
    const cwd = mkdtempSync(join(tmpdir(), "kronos-room-project-"));
    const api = <T>(route: string, method = "GET", body?: Record<string, unknown>) => request(route, {
        method, ...(body ? { body: JSON.stringify(body) } : {}),
    }, session.info.url) as Promise<T>;
    const cli = (...args: string[]) => runControlOmb(args, { env: { OPENMAUSBOT_URL: session.info.url } }) as Promise<any>;
    try {
        const service = new ProjectRoomService(api);
        const room = await service.create({ action: "create", name: "Release fixture", cwd });
        const [researcher, builder, reviewer] = room.members;
        const plan = {
            [builder.id]: { turns: [
                { steps: [{ arguments: { bot_ids: [researcher.id], message: "Research the requested artifact" } }], reply: "Researcher, gather the evidence." },
                { writeFiles: { "result.md": "Verified project output\n" }, steps: [{ arguments: { bot_ids: [reviewer.id], message: "Verify result.md and report checks" } }], reply: "Reviewer, verify [result.md](result.md)." },
                { reply: "Completed: [result.md](result.md). Research and review are in this room." },
            ] },
            [researcher.id]: { reply: "Research evidence: the output must be a Markdown document." },
            [reviewer.id]: { reply: "Review complete: result.md meets the requested format." },
        };
        writeFileSync(join(session.info.dataDir, "room-plan.json"), JSON.stringify(plan));
        await cli("send-channel", "--channel", room.id, "--text", "Build and review a Markdown artifact with the team.");
        expect((await cli("wait", "--channel", room.id, "--timeout", "40")).status).toBe("settled");
        const rows = readHandoffs(session.info.dataDir).filter((row: any) => row.parentId);
        expect(rows.map((row: any) => row.botId).sort()).toEqual([researcher.id, reviewer.id].sort());
        expect(rows.every((row: any) => row.status === "completed")).toBe(true);
        expect(readFileSync(join(cwd, "result.md"), "utf8")).toBe("Verified project output\n");
        const reopened = await new ProjectRoomService(api).create({ action: "create", name: "Release fixture", cwd });
        expect(reopened.id).toBe(room.id);
        const transcript = await api<{ messages: { text?: string; from?: { botId: string }; roomRequest?: unknown }[] }>(`/api/threads/${room.threadId}/messages`);
        expect(transcript.messages.map((message) => message.text ?? "").join("\n")).toContain("Completed: [result.md]");
        expect(transcript.messages.some((message) => message.roomRequest)).toBe(true);
    } finally {
        await session.close();
        rmSync(cwd, { recursive: true, force: true });
    }
}, 90_000);

it("preserves a teammate failure in the room instead of treating it as silence", async () => {
    const session = await launchVerificationServer(process.env, undefined, undefined, undefined, undefined, { scripted: true });
    const cwd = mkdtempSync(join(tmpdir(), "kronos-room-failure-"));
    const api = <T>(route: string, method = "GET", body?: Record<string, unknown>) => request(route, { method, ...(body ? { body: JSON.stringify(body) } : {}) }, session.info.url) as Promise<T>;
    const cli = (...args: string[]) => runControlOmb(args, { env: { OPENMAUSBOT_URL: session.info.url } }) as Promise<any>;
    try {
        const room = await new ProjectRoomService(api).create({ action: "create", name: "Failure fixture", cwd });
        const [, builder, reviewer] = room.members;
        writeFileSync(join(session.info.dataDir, "room-plan.json"), JSON.stringify({
            [builder.id]: { steps: [{ arguments: { bot_ids: [reviewer.id], message: "Verify the result" } }], reply: "Assigned review", resumeReply: "Review failed; verification is incomplete." },
            [reviewer.id]: { failWith: "Reviewer engine unavailable" },
        }));
        await cli("send-channel", "--channel", room.id, "--text", "Ask Reviewer to verify this result.");
        await cli("wait", "--channel", room.id, "--timeout", "40");
        expect(readHandoffs(session.info.dataDir).some((row: any) => row.parentId && row.status === "failed")).toBe(true);
        const transcript = await api<any>(`/api/threads/${room.threadId}/messages`);
        expect(transcript.messages.some((message: any) => message.tool?.ok === false)).toBe(true);
        expect(JSON.stringify(transcript.messages)).toContain("Review failed");
    } finally {
        await session.close();
        rmSync(cwd, { recursive: true, force: true });
    }
}, 90_000);
