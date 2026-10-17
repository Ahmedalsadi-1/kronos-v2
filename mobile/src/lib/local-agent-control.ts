let current: { controller: AbortController; finished: Promise<void> } | undefined;
export function registerLocalAgentControl(controller: AbortController, finished: Promise<void>): () => void {
    const run = { controller, finished };
    current = run;
    return () => {
        if (current === run) current = undefined;
    };
}
export async function pauseLocalAgentForTakeover(): Promise<void> {
    const run = current;
    if (!run) return;
    run.controller.abort();
    await run.finished;
}
