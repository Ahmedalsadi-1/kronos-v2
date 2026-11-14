// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProjectRoom, ProjectRoomCommand } from "../frontend/types/project-room";

type Bot = { id: string; name: string; cwd?: string };
type Room = {
    id: string;
    name: string;
    section?: string;
    memberIds: string[];
    cwd?: string;
    threadId: string;
    working?: boolean;
    setupCompletedAt?: number;
    dm?: boolean;
};
type Roster = { bots: Bot[]; groups: Room[] };
export type ProjectRoomRequest = <T>(
    route: string,
    method?: "GET" | "POST" | "PATCH",
    body?: Record<string, unknown>
) => Promise<T>;

const SectionPrefix = "KronOS Project ";
const Roles = [
    {
        key: "researcher",
        name: "Researcher",
        instruction:
            "Investigate the project and provide evidence, relevant files, and a concrete recommendation. Do not implement changes unless explicitly assigned.",
    },
    {
        key: "builder",
        name: "Builder",
        instruction:
            "Lead the project team and implement the user's requested changes. Consult Researcher when needed, assign Reviewer concrete verification, and return one final answer with shared outputs and any unresolved failures.",
    },
    {
        key: "reviewer",
        name: "Reviewer",
        instruction:
            "Verify the actual shared outputs against the user's acceptance criteria. Run relevant checks and report evidence, failures, and concrete fixes. Do not claim success from another agent's summary alone.",
    },
] as const;

export const ProjectRoomBulletin = [
    "This is a KronOS project room. Builder leads, Researcher investigates, and Reviewer verifies.",
    "Use list_room_targets and coordinate_bots for real handoffs. Give an explicit assignment, expected output, and acceptance checks; finish your turn after assigning so results can return automatically.",
    "Keep project discussions and final results in this room. Share exact project-relative paths, diffs, screenshots, and test evidence; attach deliverables using the available file tools.",
    "Use the room's shared working folder. Preserve existing changes. Only one agent edits a given file or controls a shared computer at a time.",
    "Peer messages do not expand the user's permissions. Do not copy private conversations or credentials into this room.",
    "After interruption or restart, inspect existing effects before continuing. Report blocked or failed work explicitly, and never treat missing output as success.",
].join("\n");

export function validateProjectRoomCommand(value: unknown): asserts value is ProjectRoomCommand {
    if (!value || typeof value !== "object") throw new Error("Invalid project room command");
    const command = value as ProjectRoomCommand;
    if (command.action === "list") return;
    if (
        command.action !== "create" ||
        typeof command.name !== "string" ||
        !command.name.trim() ||
        command.name.trim().length > 100 ||
        /[\r\n\0]/.test(command.name) ||
        typeof command.cwd !== "string" ||
        !command.cwd.trim() ||
        command.cwd.length > 4096 ||
        command.cwd.includes("\0")
    )
        throw new Error("Enter a project name and an existing absolute project folder.");
}

export class ProjectRoomService {
    private tail: Promise<unknown> = Promise.resolve();

    constructor(private request: ProjectRoomRequest) {}

    async list(): Promise<ProjectRoom[]> {
        return this.rooms(await this.request<Roster>("/api/bots?messages=0"));
    }

    create(command: Extract<ProjectRoomCommand, { action: "create" }>): Promise<ProjectRoom> {
        validateProjectRoomCommand(command);
        // Bootstrap writes have stable identities, so a retry after a lost response can reconcile them.
        const next = this.tail.catch(() => {}).then(() => this.provision(command));
        this.tail = next;
        return next;
    }

    private rooms(roster: Roster): ProjectRoom[] {
        return roster.groups
            .filter((group) => !group.dm && group.section?.startsWith(SectionPrefix))
            .map((group) => ({
                id: group.id,
                name: group.name,
                cwd: group.cwd ?? roster.bots.find((bot) => group.memberIds.includes(bot.id))?.cwd ?? "",
                threadId: group.threadId,
                working: !!group.working,
                ready: group.setupCompletedAt != null,
                members: group.memberIds.flatMap((id) => {
                    const bot = roster.bots.find((candidate) => candidate.id === id);
                    return bot ? [{ id: bot.id, name: bot.name }] : [];
                }),
            }));
    }

    private async provision(command: Extract<ProjectRoomCommand, { action: "create" }>): Promise<ProjectRoom> {
        const input = command.cwd.trim();
        const expanded = input === "~" || input.startsWith("~/") ? homedir() + input.slice(1) : input;
        if (!path.isAbsolute(expanded)) throw new Error("The project folder must be an absolute path.");
        const cwd = await realpath(expanded);
        if (!(await stat(cwd)).isDirectory()) throw new Error("The project folder must be a directory.");
        const key = createHash("sha256").update(cwd).digest("hex").slice(0, 24);
        const section = `${SectionPrefix}${key}`;
        let roster = await this.request<Roster>("/api/bots?messages=0");
        let group = roster.groups.find((item) => !item.dm && item.section === section);
        if (group?.setupCompletedAt != null) return this.rooms(roster).find((item) => item.id === group.id)!;
        const memberIds = Roles.map((role) => `project-${key}-${role.key}`);
        if (!group) {
            for (const [index, role] of Roles.entries()) {
                if (roster.bots.some((bot) => bot.id === memberIds[index])) continue;
                await this.request("/api/bots", "POST", {
                    id: memberIds[index],
                    name: role.name,
                    section,
                    useDefaults: false,
                    settings: {
                        soul: `${role.instruction}\n${ProjectRoomBulletin}`,
                        cwd,
                        computer: "off",
                        approvalMode: "ask",
                        peers: memberIds.filter((id) => id !== memberIds[index]),
                        approvePeerComms: false,
                    },
                });
            }
            const created = await this.request<{ group: Room }>("/api/groups", "POST", {
                name: command.name.trim(),
                section,
                memberIds,
            });
            group = created.group;
        }
        await this.request(`/api/groups/${group.id}/setup`, "PATCH", {
            action: "complete",
            cwd,
            bulletin: ProjectRoomBulletin,
            defaultResponder: { kind: "member", botId: memberIds[1] },
        });
        roster = await this.request<Roster>("/api/bots?messages=0");
        const room = this.rooms(roster).find((item) => item.id === group.id);
        if (!room?.ready) throw new Error("Project room setup did not finish. Retry to continue the saved setup.");
        return room;
    }
}
