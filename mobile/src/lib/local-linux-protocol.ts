export type LocalLinuxPhase = "idle" | "starting" | "running" | "paused" | "saving" | "failed";
export interface LocalLinuxState {
    phase: LocalLinuxPhase;
    ready: boolean;
    output: string;
    error: string;
    executing?: boolean;
    savedAt?: number;
}
export interface LocalLinuxFile {
    path: string;
    content: string;
}
export interface LocalLinuxEntry {
    name: string;
    path: string;
    kind: "directory" | "file" | "other";
    size: number;
    modifiedAt: number;
}
export type LocalLinuxRequest =
    | { id: number; type: "start"; snapshot?: ArrayBuffer; assetBaseURL: string }
    | { id: number; type: "input"; text: string }
    | { id: number; type: "pause" | "resume" | "save" }
    | { id: number; type: "write-files"; files: LocalLinuxFile[] }
    | { id: number; type: "read-file"; path: string }
    | { id: number; type: "list-files"; path: string };
export type LocalLinuxResponse =
    | { type: "output"; text: string }
    | { type: "phase"; phase: LocalLinuxPhase; ready: boolean }
    | { type: "result"; id: number; snapshot?: ArrayBuffer; content?: string; entries?: LocalLinuxEntry[] }
    | { type: "error"; id?: number; message: string };

export const LocalLinuxRevision = "v86-0.5.471-linux-507a759c-64mb-v1";
export const LocalLinuxReadyMarker = "KRONTERM_VM_READY";

export function safeGuestPath(path: string): boolean {
    return (
        path.length > 0 &&
        path.length <= 512 &&
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !/[\x00-\x1f\x7f]/.test(path) &&
        path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    );
}

export function shouldStartLocalLinux(
    hostsLoaded: boolean,
    active: boolean,
    connections: string[],
    networkOnline = true
): boolean {
    return (
        hostsLoaded &&
        active &&
        (!networkOnline || connections.every((connection) => connection === "offline" || connection === "degraded"))
    );
}
