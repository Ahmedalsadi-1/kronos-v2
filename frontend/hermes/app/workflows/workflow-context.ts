import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import { useEffect } from "react";

export type WorkflowContext = {
    tabId?: string;
    workspaceId?: string;
    workflowId?: string;
    hasExecutions?: boolean;
    surface?: string;
};
export const $workflowContext = atom<WorkflowContext>({});
export const $workflowSidebarMode = atom<"sessions" | "workflows">("sessions");

export function useWorkflowContext() {
    const context = useStore($workflowContext);
    useEffect(() => {
        const receive = (event: Event) => {
            const next = (event as CustomEvent<WorkflowContext>).detail;
            if (!next || typeof next.tabId !== "string") return;
            const previous = $workflowContext.get();
            if (JSON.stringify(previous) !== JSON.stringify(next)) $workflowContext.set(next);
        };
        window.addEventListener("kronterm:workflow-context", receive);
        window.dispatchEvent(new Event("kronterm:workflow-context-request"));
        return () => window.removeEventListener("kronterm:workflow-context", receive);
    }, []);
    return context;
}
