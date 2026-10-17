// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { launchProjectEnvironment, planProjectEnvironment, ProjectEnvironmentLaunchError } from "./project-environment";

const Input = { root: "/work/project", url: "http://localhost:3000", connection: "dev@example" };

describe("project environments", () => {
    it("binds terminal and files to the SSH project but keeps the browser local", () => {
        const plan = planProjectEnvironment(Input);
        expect(plan.widgets[0].blockDef.meta).toMatchObject({ "cmd:cwd": Input.root, connection: Input.connection });
        expect(plan.widgets[2].blockDef.meta).toMatchObject({ file: Input.root, connection: Input.connection });
        expect(plan.widgets[1].blockDef.meta.connection).toBeUndefined();
        expect(plan.widgets.every((widget) => widget.blockDef.meta["environment:key"] === plan.key)).toBe(true);
    });
    it("rejects relative roots and executable URLs before creating widgets", () => {
        expect(() => planProjectEnvironment({ ...Input, root: "project" })).toThrow("absolute project folder");
        expect(() => planProjectEnvironment({ ...Input, url: "javascript:alert(1)" })).toThrow("http://");
    });
    it("reuses live roles and creates only missing widgets", async () => {
        const create = vi.fn().mockResolvedValue("new-files");
        const ensureConnection = vi.fn().mockResolvedValue(undefined);
        const result = await launchProjectEnvironment(planProjectEnvironment(Input), {
            create,
            ensureConnection,
            remove: vi.fn(),
            findExisting: (_key, role) => (role === "files" ? undefined : `existing-${role}`),
        });
        expect(ensureConnection).toHaveBeenCalledWith(Input.connection);
        expect(create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(["existing-terminal", "existing-browser", "new-files"]);
    });
    it("rolls back only newly created widgets on partial failure", async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        await expect(
            launchProjectEnvironment(planProjectEnvironment(Input), {
                create: vi
                    .fn()
                    .mockResolvedValueOnce("new-browser")
                    .mockRejectedValueOnce(new Error("files unavailable")),
                remove,
                ensureConnection: vi.fn().mockResolvedValue(undefined),
                findExisting: (_key, role) => (role === "terminal" ? "live-terminal" : undefined),
            })
        ).rejects.toThrow("Newly opened widgets were removed");
        expect(remove).toHaveBeenCalledExactlyOnceWith("new-browser");
    });
    it("reports retained identities when cleanup fails", async () => {
        try {
            await launchProjectEnvironment(planProjectEnvironment(Input), {
                create: vi
                    .fn()
                    .mockResolvedValueOnce("terminal-id")
                    .mockRejectedValueOnce(new Error("browser unavailable")),
                remove: vi.fn().mockRejectedValue(new Error("offline")),
                ensureConnection: vi.fn().mockResolvedValue(undefined),
                findExisting: () => undefined,
            });
            expect.fail("Launch should fail");
        } catch (error) {
            expect(error).toBeInstanceOf(ProjectEnvironmentLaunchError);
            expect((error as ProjectEnvironmentLaunchError).remainingBlockIds).toEqual(["terminal-id"]);
        }
    });
});
