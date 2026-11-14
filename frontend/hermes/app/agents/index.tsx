import { $subagentsBySession, allSubagents } from "@hermes/store/subagents";
import { useStore } from "@nanostores/react";
import { SubagentTheater } from "./subagent-theater";

export function AgentsView({ onClose }: { onClose: () => void }) {
    const bySession = useStore($subagentsBySession);
    return <SubagentTheater agents={allSubagents(bySession)} onClose={onClose} showRecovery />;
}
