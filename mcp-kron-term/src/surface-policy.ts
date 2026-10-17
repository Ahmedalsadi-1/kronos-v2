import type { SurfaceCapability } from "./wsh-bridge.js";

export function isToolAllowedBySurfaceCapability(name: string, capability?: SurfaceCapability): boolean {
    if (!capability || capability.hostMode !== "web-fullscreen") {
        return true;
    }
    const explicit = capability.capabilities?.customTools?.[name];
    if (explicit != null) {
        return explicit;
    }
    if (
        name === "surface_status" ||
        name === "tool_search" ||
        name === "app_workflow" ||
        name.startsWith("shared_skill_")
    ) {
        return true;
    }
    if (name.startsWith("browser_")) return Boolean(capability.capabilities?.browser);
    if (name.startsWith("terminal_")) return Boolean(capability.capabilities?.terminal);
    if (name.startsWith("file_")) return Boolean(capability.capabilities?.files);
    if (name.startsWith("sandbox_") && !name.startsWith("sandbox_task_"))
        return Boolean(capability.capabilities?.sandbox);
    if (
        name.startsWith("kron_computer_") ||
        name.startsWith("device_") ||
        name.startsWith("linux_desktop_") ||
        name.startsWith("sandbox_task_")
    )
        return Boolean(capability.capabilities?.computerControl);
    return false;
}
