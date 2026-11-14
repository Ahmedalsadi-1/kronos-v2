// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type ProjectRoomCommand = { action: "list" } | { action: "create"; name: string; cwd: string };

export type ProjectRoom = {
    id: string;
    name: string;
    cwd: string;
    threadId: string;
    working: boolean;
    ready: boolean;
    members: { id: string; name: string }[];
};

export type ProjectRoomState = {
    origin: string;
    parentOrigin: string;
    rooms: ProjectRoom[];
    selectedId?: string;
};
