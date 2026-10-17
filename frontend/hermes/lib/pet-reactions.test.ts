import { describe, expect, it, vi } from "vitest";
import { PetReactionQueue } from "./pet-reactions";

describe("pet speech sequencing", () => {
    it("plays only the newest reaction after speech finishes", () => {
        const play = vi.fn();
        const queue = new PetReactionQueue(play, () => 1_000);
        queue.setSpeaking(true);
        queue.request("wave", 1_600);
        queue.request("celebrate", 2_200);
        expect(play).not.toHaveBeenCalled();
        queue.setSpeaking(false);
        queue.setSpeaking(false);
        expect(play).toHaveBeenCalledExactlyOnceWith("celebrate", 2_200);
    });

    it("expires delayed reactions and supports immediate error cancellation", () => {
        let now = 0;
        const play = vi.fn();
        const queue = new PetReactionQueue(play, () => now);
        queue.setSpeaking(true);
        queue.request("celebrate", 2_200);
        now = 15_000;
        queue.setSpeaking(false);
        expect(play).not.toHaveBeenCalled();
        queue.setSpeaking(true);
        queue.request("wave", 1_600);
        queue.clear();
        queue.setSpeaking(false);
        expect(play).not.toHaveBeenCalled();
        queue.request("ready", 1_000);
        expect(play).toHaveBeenCalledExactlyOnceWith("ready", 1_000);
    });
});
