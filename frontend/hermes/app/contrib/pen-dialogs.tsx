import { useStore } from "@nanostores/react";

import { $sessionStates } from "@hermes/store/session-states";
import { $subagentsBySession } from "@hermes/store/subagents";

import { SubagentTheater } from "../agents/subagent-theater";

export type PenDialogRequest =
    | { kind: "command"; sessionId: string | null; resume: (id: string) => Promise<void> }
    | { kind: "subagents"; sessionId: string; workerId?: string };

export function PenSubagentDialog({
    request,
    onClose,
}: {
    request: Extract<PenDialogRequest, { kind: "subagents" }>;
    onClose: () => void;
}) {
    const bySession = useStore($subagentsBySession);
    const storedId = $sessionStates.get()[request.sessionId]?.storedSessionId;
    const agents = new Map((bySession[storedId] ?? []).map((agent) => [agent.id, agent]));
    for (const agent of bySession[request.sessionId] ?? []) agents.set(agent.id, agent);
    return (
        <SubagentTheater
            agents={[...agents.values()]}
            initialAgentId={request.workerId}
            contentClassName="pen-hermes-dialog"
            onClose={onClose}
        />
    );
}
