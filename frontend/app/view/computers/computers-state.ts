// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
    ComputerTarget,
    ComputerTargetAction,
    ComputerTargetSession,
    ComputerTargetSnapshot,
    ComputerTargetsResult,
} from "../../../types/computer-targets";

export type ComputersApi = {
    startComputerTargetSession?: (
        targetId: string,
        expectedGeneration: number
    ) => Promise<ComputerTargetsResult<ComputerTargetSession>>;
    readComputerTargetFrame?: (
        sessionId: string
    ) => Promise<ComputerTargetsResult<import("../../../types/computer-targets").ComputerTargetFrame>>;
    stopComputerTargetSession?: (sessionId: string) => Promise<ComputerTargetsResult<void>>;
    listComputerTargets(): Promise<ComputerTargetsResult<ComputerTarget[]>>;
    performComputerTargetAction(action: ComputerTargetAction): Promise<ComputerTargetsResult<ComputerTargetSnapshot>>;
    takeOverComputerTarget(targetId: string): Promise<ComputerTargetsResult<ComputerTargetSnapshot>>;
    resumeComputerTarget(
        targetId: string,
        expectedGeneration: number
    ): Promise<ComputerTargetsResult<ComputerTargetSnapshot>>;
};
export type ComputersState = {
    targets: ComputerTarget[];
    selectedId: string;
    loading: boolean;
    busy: boolean;
    error: string;
    snapshot?: ComputerTargetSnapshot;
    session?: ComputerTargetSession;
    connecting?: boolean;
};

export function normalizedCapturePoint(
    bounds: { left: number; top: number; width: number; height: number },
    clientX: number,
    clientY: number
) {
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
}

export class ComputersController {
    state: ComputersState = { targets: [], selectedId: "", loading: false, busy: false, error: "" };
    private requestGeneration = 0;
    private disposed = false;
    private streamGeneration = 0;
    private disconnecting: Promise<unknown> = Promise.resolve();
    private inputQueue: Promise<void> = Promise.resolve();
    private pendingInputs = 0;
    private frameTimer: ReturnType<typeof setTimeout>;

    constructor(
        private api: ComputersApi,
        private onChange: (state: ComputersState) => void
    ) {}

    private update(patch: Partial<ComputersState>) {
        if (this.disposed) return;
        this.state = { ...this.state, ...patch };
        this.onChange(this.state);
    }

    select(id: string) {
        if (this.state.busy || !this.state.targets.some((target) => target.id == id)) return;
        this.disconnect();
        this.update({ selectedId: id, snapshot: undefined, error: "" });
    }

    async refresh() {
        if (this.state.busy || this.disposed) return;
        const generation = ++this.requestGeneration;
        this.update({ loading: true, error: "" });
        try {
            const result = await this.api.listComputerTargets();
            if (generation != this.requestGeneration || this.disposed) return;
            if (result.success === false) throw new Error(result.error.message);
            const selectedId = result.data.some((target) => target.id == this.state.selectedId)
                ? this.state.selectedId
                : (result.data[0]?.id ?? "");
            const snapshotTarget = result.data.find((target) => target.id == this.state.snapshot?.target.id);
            const snapshot =
                snapshotTarget &&
                ["booted", "connected"].includes(snapshotTarget.status) &&
                snapshotTarget.controlGeneration == this.state.snapshot?.target.controlGeneration
                    ? this.state.snapshot
                    : undefined;
            const sessionTarget = result.data.find((target) => target.id == this.state.session?.targetId);
            if (
                this.state.session &&
                (!sessionTarget ||
                    sessionTarget.controlGeneration != this.state.session.controlGeneration ||
                    !["booted", "connected"].includes(sessionTarget.status))
            )
                this.disconnect();
            this.update({ targets: result.data, selectedId, snapshot });
        } catch (error) {
            if (generation == this.requestGeneration)
                this.update({ error: error instanceof Error ? error.message : "Could not load devices." });
        } finally {
            if (generation == this.requestGeneration) this.update({ loading: false });
        }
    }

    async act(
        action: ComputerTargetAction["action"] | "takeover" | "resume",
        input: Pick<ComputerTargetAction, "x" | "y" | "text" | "key" | "endX" | "endY" | "orientation" | "button"> = {}
    ) {
        if (["tap", "type", "key", "swipe", "home", "back", "button"].includes(action)) {
            if (this.pendingInputs >= 16) {
                this.update({ error: "Device input queue is full." });
                return;
            }
            const selectedId = this.state.selectedId;
            const generation = this.state.targets.find((item) => item.id === selectedId)?.controlGeneration;
            this.pendingInputs++;
            const pending = this.inputQueue
                .then(async () => {
                    if (this.disposed || this.state.selectedId !== selectedId) return;
                    if (this.state.targets.find((item) => item.id === selectedId)?.controlGeneration !== generation) {
                        this.update({ error: "Control changed. Pending device input was discarded." });
                        return;
                    }
                    await this.performAction(action, input);
                })
                .finally(() => {
                    this.pendingInputs--;
                });
            this.inputQueue = pending.catch(() => {});
            return pending;
        }
        return this.performAction(action, input);
    }

    private async performAction(
        action: ComputerTargetAction["action"] | "takeover" | "resume",
        input: Pick<ComputerTargetAction, "x" | "y" | "text" | "key" | "endX" | "endY" | "orientation" | "button"> = {}
    ) {
        const target = this.state.targets.find((item) => item.id == this.state.selectedId);
        if (!target || this.state.busy || this.disposed) return;
        const reconnect = !!this.state.session && (action == "takeover" || action == "resume");
        ++this.requestGeneration;
        this.update({ busy: true, loading: false, error: "" });
        try {
            const result =
                action == "takeover"
                    ? await this.api.takeOverComputerTarget(target.id)
                    : action == "resume"
                      ? await this.api.resumeComputerTarget(target.id, target.controlGeneration)
                      : await this.api.performComputerTargetAction({
                            targetId: target.id,
                            action,
                            expectedGeneration: target.controlGeneration,
                            ...input,
                        });
            if (result.success === false) throw new Error(result.error.message);
            const session = this.state.session;
            if (session && (result.data.target.controlGeneration != session.controlGeneration || action == "shutdown"))
                this.disconnect();
            this.update({
                targets: this.state.targets.map((item) => (item.id == target.id ? result.data.target : item)),
                snapshot: result.data.imageDataUrl ? result.data : this.state.session ? this.state.snapshot : undefined,
            });
        } catch (error) {
            this.update({ error: error instanceof Error ? error.message : "Device action failed." });
        } finally {
            this.update({ busy: false });
        }
        if (reconnect && !this.state.error && !this.disposed) await this.connect();
    }

    async connect() {
        const target = this.state.targets.find((item) => item.id == this.state.selectedId);
        if (!target || this.state.busy || this.disposed || this.state.connecting || this.state.session) return;
        if (!this.api.startComputerTargetSession || !this.api.readComputerTargetFrame) {
            await this.act("screenshot");
            return;
        }
        const generation = ++this.streamGeneration;
        this.update({ connecting: true, error: "" });
        try {
            await this.disconnecting;
            if (this.disposed || generation != this.streamGeneration) return;
            const result = await this.api.startComputerTargetSession(target.id, target.controlGeneration);
            if (result.success === false) throw new Error(result.error.message);
            if (this.disposed || generation != this.streamGeneration || target.id != this.state.selectedId) {
                await this.api.stopComputerTargetSession?.(result.data.id);
                return;
            }
            this.update({ session: result.data, connecting: false, snapshot: undefined });
            void this.readFrame(result.data, generation);
        } catch (error) {
            if (generation == this.streamGeneration)
                this.update({
                    error: error instanceof Error ? error.message : "Could not connect device.",
                    connecting: false,
                });
        }
    }

    private async readFrame(session: ComputerTargetSession, generation: number, failures = 0) {
        if (this.disposed || generation != this.streamGeneration) return;
        if (typeof document != "undefined" && document.hidden) {
            this.frameTimer = setTimeout(() => void this.readFrame(session, generation, failures), 1000);
            return;
        }
        try {
            const result = await this.api.readComputerTargetFrame(session.id);
            if (this.disposed || generation != this.streamGeneration) return;
            if (result.success === false) throw new Error(result.error.message);
            const target = this.state.targets.find((item) => item.id == session.targetId);
            if (
                !target ||
                target.controlGeneration != session.controlGeneration ||
                result.data.sessionId != session.id
            ) {
                this.disconnect();
                return;
            }
            this.update({
                snapshot: { target, imageDataUrl: result.data.imageDataUrl, capturedAt: result.data.capturedAt },
            });
            this.frameTimer = setTimeout(() => void this.readFrame(session, generation), 100);
        } catch (error) {
            if (generation != this.streamGeneration) return;
            if (session.targetId.startsWith("android-") && failures < 3) {
                this.frameTimer = setTimeout(() => void this.readFrame(session, generation, failures + 1), 250);
                return;
            }
            this.disconnect();
            this.update({ error: error instanceof Error ? error.message : "Device disconnected." });
        }
    }

    disconnect() {
        ++this.streamGeneration;
        clearTimeout(this.frameTimer);
        const session = this.state.session;
        if (session || this.state.connecting)
            this.update({ session: undefined, connecting: false, snapshot: undefined });
        if (session)
            this.disconnecting = this.disconnecting
                .then(() => this.api.stopComputerTargetSession?.(session.id))
                .catch(() => {});
    }

    dispose() {
        this.disconnect();
        this.disposed = true;
        ++this.requestGeneration;
    }
}
