// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectRoomService, validateProjectRoomCommand, type ProjectRoomRequest } from "./project-room-service";

const folders: string[] = [];
async function fixture() {
    const cwd = await mkdtemp(path.join(tmpdir(), "kronos-project-test-"));
    folders.push(cwd);
    const roster = { bots: [] as any[], groups: [] as any[] };
    let loseResponse = "";
    const request = vi.fn(async (route: string, method = "GET", body?: any) => {
        let result: unknown;
        if (method === "GET") return structuredClone(roster);
        if (route === "/api/bots") {
            if (roster.bots.some((bot) => bot.id === body.id)) throw new Error("Duplicate bot");
            const bot = { ...body, ...body.settings };
            roster.bots.push(bot);
            result = { bot };
        } else if (route === "/api/groups") {
            const group = { ...body, id: `room-${roster.groups.length}`, threadId: "thread-one" };
            roster.groups.push(group);
            result = { group };
        } else if (route.endsWith("/setup")) {
            Object.assign(roster.groups[0], body, { setupCompletedAt: 100 });
            result = { group: roster.groups[0] };
        } else throw new Error(`Unexpected ${route}`);
        if (loseResponse === route) {
            loseResponse = "";
            throw new Error("Connection lost after commit");
        }
        return structuredClone(result);
    }) as unknown as ReturnType<typeof vi.fn> & ProjectRoomRequest;
    return {
        cwd,
        roster,
        request,
        lose: (route: string) => {
            loseResponse = route;
        },
        command: { action: "create" as const, name: "Demo", cwd },
    };
}
afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

it("creates a scoped team and reuses the project after restart or simultaneous opens", async () => {
    const f = await fixture();
    const service = new ProjectRoomService(f.request);
    const rooms = await Promise.all([service.create(f.command), service.create(f.command)]);
    expect(rooms[0]).toEqual(rooms[1]);
    expect(rooms[0]).toMatchObject({
        ready: true,
        cwd: await import("node:fs/promises").then((fs) => fs.realpath(f.cwd)),
    });
    expect(f.roster.bots.map((bot) => bot.name)).toEqual(["Researcher", "Builder", "Reviewer"]);
    expect(
        f.roster.bots.every((bot) => bot.approvalMode === "ask" && bot.computer === "off" && bot.peers.length === 2)
    ).toBe(true);
    expect(f.roster.groups[0].defaultResponder.botId).toBe(f.roster.bots[1].id);
    expect(await new ProjectRoomService(f.request).create(f.command)).toEqual(rooms[0]);
    expect(f.roster.groups).toHaveLength(1);
    expect(f.roster.bots).toHaveLength(3);
    f.roster.groups.unshift({ ...f.roster.groups[0], id: "private-pair", dm: true });
    expect((await service.list()).map((room) => room.id)).toEqual([rooms[0].id]);
    expect((await service.create(f.command)).id).toBe(rooms[0].id);
});

it.each(["/api/bots", "/api/groups", "/api/groups/room-0/setup"])(
    "reconciles a lost %s response without duplicating saved work",
    async (route) => {
        const f = await fixture();
        f.lose(route);
        await expect(new ProjectRoomService(f.request).create(f.command)).rejects.toThrow("Connection lost");
        expect(await new ProjectRoomService(f.request).create(f.command)).toMatchObject({ ready: true });
        expect(f.roster.bots).toHaveLength(3);
        expect(f.roster.groups).toHaveLength(1);
    }
);

it("canonicalizes project symlinks and does not change an existing room's instructions", async () => {
    const f = await fixture();
    const service = new ProjectRoomService(f.request);
    const room = await service.create(f.command);
    const link = path.join(f.cwd, "alias");
    await symlink(f.cwd, link);
    f.roster.groups[0].bulletin = "User's custom instructions";
    expect((await service.create({ ...f.command, cwd: link })).id).toBe(room.id);
    expect(f.roster.groups[0].bulletin).toBe("User's custom instructions");
});

it("rejects malformed input and missing folders before any writes", async () => {
    const f = await fixture();
    for (const command of [null, { action: "delete" }, { ...f.command, name: "" }, { ...f.command, cwd: "\0" }])
        expect(() => validateProjectRoomCommand(command)).toThrow();
    const service = new ProjectRoomService(f.request);
    await expect(service.create({ ...f.command, cwd: "relative" })).rejects.toThrow("absolute");
    await expect(service.create({ ...f.command, cwd: path.join(f.cwd, "missing") })).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
});
