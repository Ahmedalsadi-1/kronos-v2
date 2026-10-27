import { NativeAgentProgress } from "@/app/workspace/native-agent-progress";
import { publishAgentActivity } from "@/types/agent-activity";

export function AgentProgressPreview() {
    return (
        <div className="min-h-screen bg-background p-12 text-foreground">
            <button
                type="button"
                className="cursor-pointer rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={() =>
                    publishAgentActivity({
                        source: "hermes",
                        phase: "running",
                        surface: "terminal",
                        action: "inspect",
                        blockid: "progress-preview",
                        detail: "Reading local project files",
                    })
                }
            >
                Show activity
            </button>
            <div className="mt-6 h-40 w-64 overflow-hidden border border-border p-4">
                Widget with clipped content
                <NativeAgentProgress blockId="progress-preview" />
            </div>
        </div>
    );
}
