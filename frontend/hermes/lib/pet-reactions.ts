export class PetReactionQueue<T> {
    private speaking = false;
    private pending: { value: T; duration: number; createdAt: number } | null = null;

    constructor(
        private play: (value: T, duration: number) => void,
        private now = Date.now
    ) {}

    request(value: T, duration: number) {
        if (!this.speaking) {
            this.play(value, duration);
            return;
        }
        this.pending = { value, duration, createdAt: this.now() };
    }

    setSpeaking(speaking: boolean) {
        this.speaking = speaking;
        if (speaking || !this.pending) return;
        const pending = this.pending;
        this.pending = null;
        if (this.now() - pending.createdAt < 15_000) this.play(pending.value, pending.duration);
    }

    clear() {
        this.pending = null;
    }
}
