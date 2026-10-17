import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const DATA_DIR = process.env.KRONTERM_LINUX_DATA_DIR || join(homedir(), ".kronterm", "linux-desktops");
export const SPAWNED_PROXIES = { containerMcp: "" };

export function augmentedPath(): string {
    return [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(delimiter);
}

export function resolveCliSpawn(command: string, args: string[]): { command: string; args: string[] } {
    return { command, args };
}
