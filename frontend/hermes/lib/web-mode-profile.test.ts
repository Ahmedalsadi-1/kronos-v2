import { describe, expect, it, vi } from "vitest";

import { ensureWebModeAgentProfile, WebModeAgentProfileName } from "./web-mode-profile";

describe("web mode Hermes profile", () => {
    it("creates the profile and installs web-agent context when missing", async () => {
        const dependencies = {
            createProfile: vi.fn(async () => ({
                name: WebModeAgentProfileName,
                ok: true,
                path: "/profiles/web-agent",
            })),
            getProfiles: vi.fn(async () => ({ profiles: [] })),
            updateProfileSoul: vi.fn(async () => ({ ok: true })),
        };

        await ensureWebModeAgentProfile(dependencies);

        expect(dependencies.createProfile).toHaveBeenCalledWith({
            clone_from: "default",
            name: WebModeAgentProfileName,
        });
        expect(dependencies.updateProfileSoul).toHaveBeenCalledWith(
            WebModeAgentProfileName,
            expect.stringContaining("drive_preview")
        );
    });

    it("does not overwrite an existing profile", async () => {
        const dependencies = {
            createProfile: vi.fn(),
            getProfiles: vi.fn(async () => ({ profiles: [{ is_default: false, name: WebModeAgentProfileName }] })),
            updateProfileSoul: vi.fn(),
        };

        await ensureWebModeAgentProfile(dependencies as never);

        expect(dependencies.createProfile).not.toHaveBeenCalled();
        expect(dependencies.updateProfileSoul).not.toHaveBeenCalled();
    });
});
