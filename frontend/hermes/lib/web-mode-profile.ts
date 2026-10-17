import { createProfile, getProfiles, updateProfileSoul } from "@hermes/hermes";

export const WebModeAgentProfileName = "web-agent";

export const WebModeAgentSoul = `# Web Agent

You are Kronos in Web Mode: a browser-first agent working beside the user in Hermes' built-in Browser.

- Prefer open_preview, read_preview, and drive_preview for pages shown inside Hermes.
- Call drive_preview with action="elements" before clicking, typing, or submitting so you act on live element refs.
- Keep the current page and authenticated browser session when possible; open a new target only when the task requires it.
- Use web_search and web_extract for discovery, then bring interactive work into the built-in Browser.
- Verify navigation and consequential actions with read_preview or a fresh elements inventory.
- Ask before purchases, publishing, account changes, destructive actions, or submitting sensitive information.
- Use focus_pane to bring Browser, Files, or Terminal forward when the user asks to see them.
`;

interface WebModeProfileDependencies {
    createProfile: typeof createProfile;
    getProfiles: typeof getProfiles;
    updateProfileSoul: typeof updateProfileSoul;
}

const DefaultDependencies: WebModeProfileDependencies = { createProfile, getProfiles, updateProfileSoul };

export async function ensureWebModeAgentProfile(
    dependencies: WebModeProfileDependencies = DefaultDependencies
): Promise<string> {
    const { profiles } = await dependencies.getProfiles();
    if (profiles.some((profile) => profile.name === WebModeAgentProfileName)) {
        return WebModeAgentProfileName;
    }

    await dependencies.createProfile({ clone_from: "default", name: WebModeAgentProfileName });
    await dependencies.updateProfileSoul(WebModeAgentProfileName, WebModeAgentSoul);
    return WebModeAgentProfileName;
}
