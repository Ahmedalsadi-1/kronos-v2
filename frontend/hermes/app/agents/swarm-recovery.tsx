import { useEffect, useState } from "react";
import type { SwarmRecoveryItem } from "../../../types/swarm";

export function SwarmRecovery({ uncertainCount }: { uncertainCount: number }) {
    const request = window.hermesDesktop?.swarmRecovery;
    const [attempts, setAttempts] = useState<SwarmRecoveryItem[]>([]);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!request || pending) return;
        let active = true;
        void request({ action: "list" }).then(
            (items) => {
                if (active) setAttempts(items);
            },
            (reason) => {
                if (active) setError(reason instanceof Error ? reason.message : String(reason));
            }
        );
        return () => {
            active = false;
        };
    }, [request, uncertainCount, pending]);

    if (!attempts.length && !error) return null;
    const acknowledge = async ({ runId, attemptId }: SwarmRecoveryItem) => {
        setPending(true);
        setError("");
        try {
            setAttempts(await request({ action: "acknowledge", runId, attemptId }));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setPending(false);
        }
    };
    return (
        <section
            aria-label="Interrupted swarms"
            className="max-h-48 shrink-0 overflow-y-auto border-b border-white/10 p-3 text-xs"
        >
            {attempts.length > 0 && (
                <>
                    <h3 className="font-medium">Interrupted swarms</h3>
                    <p>Inspect each target before allowing a new swarm to use it.</p>
                    <ul className="mt-2 space-y-2">
                        {attempts.map((attempt) => (
                            <li key={attempt.attemptId} className="flex items-start justify-between gap-3">
                                <div className="min-w-0 break-words">
                                    <strong>{attempt.targetLabel}</strong>
                                    <p>{attempt.goal}</p>
                                    {attempt.summary && <p>{attempt.summary}</p>}
                                </div>
                                <button type="button" disabled={pending} onClick={() => void acknowledge(attempt)}>
                                    Review target
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
