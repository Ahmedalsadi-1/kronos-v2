import { expect, it } from "vitest";
import { pauseLocalAgentForTakeover, registerLocalAgentControl } from "./local-agent-control";
it("waits for the cancelled agent operation to settle before granting takeover", async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const unregister = registerLocalAgentControl(controller, finished);
    let released = false;
    const paused = pauseLocalAgentForTakeover().then(() => {
        released = true;
    });
    expect(controller.signal.aborted).toBe(true);
    await Promise.resolve();
    expect(released).toBe(false);
    finish();
    await paused;
    expect(released).toBe(true);
    unregister();
});
