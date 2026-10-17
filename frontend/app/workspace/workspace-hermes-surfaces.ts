import type { WorkspacePresentation } from "@/app/tab/workspace-presentation";

export function shouldRenderHermesAuxiliarySurfaces(presentation: WorkspacePresentation): boolean {
    return presentation !== "web";
}
