import { WorkflowCanvas } from "@/app/plugins/openhuman-workflow/workflow-canvas";
import type { WorkflowGraph } from "@/types/workflow-graph";
const graph: WorkflowGraph = {
    version: 1,
    nodes: [
        {
            id: "research",
            title: "Inspect the workspace",
            kind: "agent",
            instruction: "Find the files relevant to the task and gather evidence.",
            position: { x: 120, y: 40 },
        },
        {
            id: "implement",
            title: "Implement the change",
            kind: "agent",
            instruction: "Make the change and run focused checks.",
            position: { x: 120, y: 210 },
        },
        {
            id: "review",
            title: "Review evidence",
            kind: "review",
            instruction: "Inspect the result before proceeding.",
            position: { x: 120, y: 380 },
        },
    ],
    edges: [
        { id: "first", source: "research", target: "implement" },
        { id: "second", source: "implement", target: "review" },
    ],
};
export function OpenHumanWorkflowPreview() {
    return (
        <div style={{ width: "100%", height: "100%" }}>
            <WorkflowCanvas initialGraph={graph} initialTitle="Workspace improvement" onSave={async () => {}} />
        </div>
    );
}
