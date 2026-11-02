import type { SurfaceCapability } from "./wsh-bridge.js";

export function isToolAllowedBySurfaceCapability(name: string, capability?: SurfaceCapability): boolean {
    if (capability?.delegationScope === "sandbox")
        return (
            name.startsWith("sandbox_vm_") ||
            name === "tool_search" ||
            name === "delegation_status" ||
            name.startsWith("shared_skill_")
        );
    if (capability?.delegationScope === "widgets")
        return (
            name === "tool_search" ||
            name === "delegation_status" ||
            name === "workspace_snapshot" ||
            [
                "widget_snapshot",
                "widget_screenshot",
                "widget_find",
                "widget_inspect",
                "widget_element_at",
                "widget_click",
                "widget_type",
                "widget_press",
                "widget_scroll",
                "widget_hover",
                "widget_mouse_move",
            ].includes(name)
        );
    if (capability?.sandboxComputerId) {
        return (
            name === "surface_status" ||
            name === "delegation_status" ||
            name === "tool_search" ||
            name.startsWith("shared_skill_") ||
            [
                "widget_snapshot",
                "widget_screenshot",
                "widget_screenshot_annotated",
                "widget_find",
                "widget_inspect",
                "widget_element_at",
                "widget_click",
                "widget_type",
                "widget_press",
                "widget_scroll",
                "widget_scroll_to",
                "widget_drag",
                "widget_hover",
                "widget_mouse_move",
            ].includes(name) ||
            name === "workspace_snapshot" ||
            name.startsWith("sandbox_vm_")
        );
    }
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
