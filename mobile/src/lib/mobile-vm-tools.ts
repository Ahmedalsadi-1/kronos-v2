import { runSandboxCode } from "./agent-linux-sandbox";
import { localLinux } from "./local-linux";
import { safeGuestPath } from "./local-linux-protocol";

export const MobileVMTools = [
    {
        type: "function",
        function: {
            name: "vm_exec",
            description:
                "Run a shell script in the user's on-device Linux console VM. No Mac required. Changes persist. Use isolated=true for a disposable guest.",
            parameters: {
                type: "object",
                properties: {
                    script: { type: "string" },
                    isolated: { type: "boolean" },
                    outputPaths: { type: "array", items: { type: "string" }, maxItems: 20 },
                },
                required: ["script"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "vm_read_file",
            description: "Read a text file from the local VM's /mnt workspace.",
            parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "vm_write_file",
            description: "Write a text file into the local VM's /mnt workspace and save its checkpoint.",
            parameters: {
                type: "object",
                properties: { path: { type: "string" }, content: { type: "string" } },
                required: ["path", "content"],
                additionalProperties: false,
            },
        },
    },
] as const;

export async function dispatchMobileVMTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid tool arguments");
    if (signal?.aborted) throw new Error("Tool cancelled");
    const input = args as Record<string, unknown>;
    const allowed =
        name === "vm_exec"
            ? ["script", "isolated", "outputPaths"]
            : name === "vm_read_file"
              ? ["path"]
              : ["path", "content"];
    if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("Unexpected tool arguments");
    if (name === "vm_exec") {
        if (typeof input.script !== "string" || (input.isolated != null && typeof input.isolated !== "boolean"))
            throw new Error("Invalid execution arguments");
        if (
            input.outputPaths != null &&
            (!Array.isArray(input.outputPaths) || input.outputPaths.some((path) => typeof path !== "string"))
        )
            throw new Error("Invalid output paths");
        const result = await runSandboxCode(
            { script: input.script, files: [], outputPaths: (input.outputPaths as string[]) ?? [], signal },
            input.isolated === true ? undefined : localLinux
        );
        if (!input.isolated) await localLinux.save();
        return { ...result, target: input.isolated ? "disposable-phone-vm" : "persistent-phone-vm" };
    }
    if (!["vm_read_file", "vm_write_file"].includes(name)) throw new Error("Unknown local VM tool");
    if (typeof input.path !== "string" || !safeGuestPath(input.path)) throw new Error("Invalid workspace path");
    if (
        name === "vm_write_file" &&
        (typeof input.content !== "string" || new TextEncoder().encode(input.content).length > 1_000_000)
    )
        throw new Error("Invalid file content (maximum 1 MB)");
    await localLinux.waitUntilReady();
    if (signal?.aborted) throw new Error("Tool cancelled");
    if (name === "vm_read_file")
        return { path: input.path, content: await localLinux.readFile(input.path), target: "persistent-phone-vm" };
    await localLinux.writeFiles([{ path: input.path, content: input.content as string }]);
    await localLinux.save();
    return { path: input.path, saved: true, target: "persistent-phone-vm" };
}
