// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type PenWidgetGeometry = {
    blockId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
};
export type PenLiveWidget = PenWidgetGeometry & { title: string };
export type PenWidgetSnapshot = { widgets: PenWidgetGeometry[]; selectedBlockIds: string[] };

export function readPenWidgetSnapshot(value: unknown): PenWidgetSnapshot | undefined {
    const snapshot = value as PenWidgetSnapshot;
    if (!Array.isArray(snapshot?.widgets) || !Array.isArray(snapshot?.selectedBlockIds)) return;
    const ids = new Set<string>();
    const widgets: PenWidgetGeometry[] = [];
    for (const widget of snapshot.widgets) {
        if (
            !widget ||
            typeof widget.blockId !== "string" ||
            !widget.blockId ||
            ids.has(widget.blockId) ||
            typeof widget.visible !== "boolean" ||
            ![widget.x, widget.y, widget.width, widget.height].every(Number.isFinite) ||
            widget.width <= 0 ||
            widget.height <= 0
        )
            return;
        ids.add(widget.blockId);
        const { blockId, x, y, width, height, visible } = widget;
        widgets.push({ blockId, x, y, width, height, visible });
    }
    if (!snapshot.selectedBlockIds.every((id) => typeof id === "string")) return;
    return { widgets, selectedBlockIds: [...new Set(snapshot.selectedBlockIds)] };
}

function widgetsKey(widgets: PenLiveWidget[]) {
    return JSON.stringify(
        [...widgets]
            .sort((a, b) => a.blockId.localeCompare(b.blockId))
            .map(({ blockId, title, x, y, width, height, visible }) => [blockId, title, x, y, width, height, visible])
    );
}

export function makePenWidgetSync({
    widgets,
    apply,
    onWidgets,
    onReady,
    onError,
}: {
    widgets: PenLiveWidget[];
    apply: (widgets: PenLiveWidget[]) => Promise<unknown>;
    onWidgets: (snapshot: PenWidgetSnapshot) => void;
    onReady: (ready: boolean) => void;
    onError: (error: unknown) => void;
}) {
    let desired = widgets.map((widget) => ({ ...widget }));
    let acknowledgedKey: string;
    let active = false;
    let initialized = false;
    let pending = false;
    let disposed = false;
    let revision = 0;
    const accept = (snapshot: PenWidgetSnapshot) => {
        const knownIds = new Set(desired.map((widget) => widget.blockId));
        const changes = new Map(
            snapshot.widgets.filter((widget) => knownIds.has(widget.blockId)).map((widget) => [widget.blockId, widget])
        );
        desired = desired.map((widget) => ({ ...widget, ...changes.get(widget.blockId) }));
        acknowledgedKey = widgetsKey(desired);
        onWidgets({
            widgets: [...changes.values()],
            selectedBlockIds: snapshot.selectedBlockIds.filter((id) => knownIds.has(id)),
        });
    };
    const flush = () => {
        if (!active || pending || disposed || widgetsKey(desired) === acknowledgedKey) return;
        pending = true;
        const sentRevision = revision;
        const sent = desired.map((widget) => ({ ...widget }));
        void apply(sent)
            .then((value) => {
                if (disposed || !active) return;
                const snapshot = readPenWidgetSnapshot(value);
                if (!snapshot) throw new Error("The canvas returned invalid widget geometry.");
                initialized = true;
                if (revision === sentRevision) {
                    accept(snapshot);
                    onReady(true);
                }
            })
            .catch((error) => {
                if (disposed || !active) return;
                active = false;
                onReady(false);
                onError(error);
            })
            .finally(() => {
                pending = false;
                flush();
            });
    };
    return {
        start() {
            active = true;
            flush();
        },
        pause() {
            active = false;
            onReady(false);
        },
        setWidgets(next: PenLiveWidget[]) {
            if (widgetsKey(next) === widgetsKey(desired)) return;
            desired = next.map((widget) => ({ ...widget }));
            revision++;
            flush();
        },
        receive(value: unknown) {
            const snapshot = readPenWidgetSnapshot(value);
            if (!snapshot || disposed || !active || !initialized) return;
            revision++;
            accept(snapshot);
        },
        dispose() {
            disposed = true;
            onReady(false);
        },
    };
}
