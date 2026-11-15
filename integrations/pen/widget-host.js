// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    window.createKronosPenWidgets = (scene, emit, document) => {
        const graph = scene.scenegraph;
        const known = new Map();
        const thumbnails = new Map();
        const thumbnailMethods = new Map();
        let syncing = false;
        let queued = false;
        let disposed = false;
        let lastSignature;
        const widgetId = (node) => {
            const metadata = node?.properties.resolved.metadata;
            return metadata?.type === "kronos-live-widget" ? metadata.blockId : undefined;
        };
        const remember = (record, node) => {
            record.node = node;
            node.canAcceptChildren = () => false;
            if (!thumbnailMethods.has(node)) {
                thumbnailMethods.set(node, node.getThumbnail);
                node.getThumbnail = async () =>
                    thumbnails.get(widgetId(node)) ?? thumbnailMethods.get(node)?.call(node);
            }
        };
        const snapshot = () => {
            graph.updateLayout();
            let normalization;
            for (const { node } of known.values()) {
                if (node.destroyed || !node.properties.resolved.rotation) continue;
                normalization ??= graph.beginUpdate();
                normalization.update(node, { rotation: 0 });
            }
            if (normalization) {
                graph.commitBlock(normalization, { undo: false });
                graph.updateLayout();
            }
            const widgets = [];
            for (const [blockId, record] of known) {
                const node = record.node;
                if (!node.destroyed) {
                    const bounds = node.getWorldBounds();
                    record.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
                }
                widgets.push({
                    blockId,
                    ...record.bounds,
                    visible: !node.destroyed && node.properties.resolved.enabled,
                });
            }
            const selectedBlockIds = [...scene.selectionManager.selectedNodes]
                .map(widgetId)
                .filter((id) => known.has(id));
            return { widgets, selectedBlockIds };
        };
        const changed = () => {
            if (syncing || disposed || queued) return;
            queued = true;
            queueMicrotask(() => {
                queued = false;
                if (disposed || syncing) return;
                const value = snapshot();
                const signature = JSON.stringify(value);
                if (signature === lastSignature) return;
                lastSignature = signature;
                emit({ type: "widgets", ...value });
            });
        };
        const added = (node) => {
            const blockId = widgetId(node);
            const record = known.get(blockId);
            if (!record) return;
            if (record.node !== node && !record.node.destroyed) {
                // A native design duplicate is a reference, not another owner of a running app.
                const update = graph.beginUpdate();
                update.update(node, { metadata: { type: "kronos-widget-reference", blockId } });
                graph.commitBlock(update, { undo: false });
                return;
            }
            remember(record, node);
            changed();
        };
        const propertyChanged = (node) => {
            if (known.has(widgetId(node))) changed();
            else if (known.size && node.children?.length) changed();
        };
        const selectedWidget = () => {
            if (scene.selectionManager.selectedNodes.size !== 1) return;
            const node = [...scene.selectionManager.selectedNodes][0];
            const blockId = widgetId(node);
            return known.has(blockId) ? blockId : undefined;
        };
        const doubleClick = (event) => {
            if (
                scene.stateManager?.state?.currentSlide ||
                event.button !== 0 ||
                event.target?.closest?.("input,textarea,select,button,a,[role=button],[contenteditable=true]")
            )
                return;
            const bounds = scene.containerBounds;
            const point = scene.camera.toWorld(event.clientX - bounds.x, event.clientY - bounds.y);
            const node = scene.selectionManager.findNodeAtWorldPosition(point.x, point.y, false, undefined, undefined, {
                includeFrameTitle: true,
            });
            const blockId = widgetId(node);
            if (!known.has(blockId)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            emit({ type: "widget-interact", blockId });
        };
        const keyDown = (event) => {
            if (scene.stateManager?.state?.currentSlide) return;
            if (event.target?.closest?.("input,textarea,select,button,a,[role=button],[contenteditable=true]")) return;
            if (event.key === "Escape") emit({ type: "widget-interact", blockId: null });
            if (event.key !== "Enter") return;
            const blockId = selectedWidget();
            if (!blockId) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            emit({ type: "widget-interact", blockId });
        };
        graph.on("nodeAdded", added);
        graph.on("nodeRemoved", propertyChanged);
        graph.on("nodePropertyChange", propertyChanged);
        scene.eventEmitter.on("selectionChange", changed);
        document.addEventListener("dblclick", doubleClick, true);
        document.addEventListener("keydown", keyDown, true);
        return {
            async updatePreviews({ previews }) {
                if (!Array.isArray(previews) || previews.length > 100) throw new Error("Invalid widget previews");
                let changed = false;
                for (const preview of previews) {
                    if (!known.has(preview?.blockId)) continue;
                    if (
                        typeof preview.dataUrl !== "string" ||
                        preview.dataUrl.length > 2_000_000 ||
                        !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(preview.dataUrl) ||
                        ![preview.width, preview.height].every(
                            (value) => Number.isFinite(value) && value > 0 && value <= 8192
                        )
                    )
                        throw new Error("Invalid widget preview image");
                    if (thumbnails.get(preview.blockId)?.dataUrl === preview.dataUrl) continue;
                    const blob = await (await fetch(preview.dataUrl)).blob();
                    if (disposed || !known.has(preview.blockId)) continue;
                    thumbnails.set(preview.blockId, {
                        blob,
                        width: preview.width,
                        height: preview.height,
                        dataUrl: preview.dataUrl,
                    });
                    changed = true;
                }
                if (changed) scene.eventEmitter.emit("kronos-widget-preview");
                return { success: true };
            },
            sync({ widgets, selectedBlockId }) {
                if (!Array.isArray(widgets)) throw new Error("Expected live widgets");
                const ids = new Set();
                for (const item of widgets) {
                    if (
                        !item ||
                        typeof item.blockId !== "string" ||
                        !item.blockId ||
                        ids.has(item.blockId) ||
                        ![item.x, item.y, item.width, item.height].every(Number.isFinite) ||
                        item.width <= 0 ||
                        item.height <= 0
                    )
                        throw new Error("Invalid live widget bounds or identity");
                    ids.add(item.blockId);
                }
                syncing = true;
                const update = graph.beginUpdate();
                if (!update) {
                    syncing = false;
                    throw new Error("The canvas cannot update live widgets yet");
                }
                try {
                    for (const node of [...graph.nodes]) {
                        const blockId = widgetId(node);
                        if (!blockId) continue;
                        if (!ids.has(blockId)) {
                            update.deleteNode(node);
                            continue;
                        }
                        if (!known.has(blockId)) {
                            const record = { node, bounds: {} };
                            remember(record, node);
                            known.set(blockId, record);
                        } else if (known.get(blockId).node !== node) added(node);
                    }
                    for (const [blockId, record] of known) {
                        if (ids.has(blockId)) continue;
                        record.node.getThumbnail = thumbnailMethods.get(record.node);
                        thumbnailMethods.delete(record.node);
                        thumbnails.delete(blockId);
                        known.delete(blockId);
                    }
                    for (const item of widgets) {
                        let record = known.get(item.blockId);
                        if (!record) {
                            const node = graph.deserializePastedNode(
                                (name) => name,
                                (pair) => pair,
                                update,
                                {
                                    type: "frame",
                                    name: item.title || "Live app",
                                    x: item.x,
                                    y: item.y,
                                    width: item.width,
                                    height: item.height,
                                    layout: "none",
                                    fill: "#00000000",
                                    enabled: item.visible !== false,
                                    metadata: { type: "kronos-live-widget", blockId: item.blockId },
                                },
                                graph.getViewportNode()
                            );
                            if (!node) throw new Error("Could not create the live app frame");
                            record = { node, bounds: { x: item.x, y: item.y, width: item.width, height: item.height } };
                            remember(record, node);
                            known.set(item.blockId, record);
                        }
                        const node = record.node;
                        if (node.destroyed) {
                            if (item.visible === false) continue;
                            update.addNode(node, graph.getViewportNode());
                        }
                        const values = node.properties.resolved;
                        const changes = {};
                        const position = node.parent.toLocal(item.x, item.y);
                        if (Math.abs(values.x - position.x) > 0.001) changes.x = position.x;
                        if (Math.abs(values.y - position.y) > 0.001) changes.y = position.y;
                        if (Math.abs(values.width - item.width) > 0.001) changes.width = item.width;
                        if (Math.abs(values.height - item.height) > 0.001) changes.height = item.height;
                        if (values.name !== (item.title || "Live app")) changes.name = item.title || "Live app";
                        if (values.enabled !== (item.visible !== false)) changes.enabled = item.visible !== false;
                        if (Object.keys(changes).length) update.update(node, changes);
                    }
                    if (selectedBlockId != null) {
                        const node = known.get(selectedBlockId)?.node;
                        if (
                            node &&
                            !node.destroyed &&
                            node.properties.resolved.enabled &&
                            selectedWidget() !== selectedBlockId
                        )
                            scene.selectionManager.selectNode(node);
                    }
                    graph.commitBlock(update, { undo: false });
                    scene.requestFrame();
                    const value = snapshot();
                    lastSignature = JSON.stringify(value);
                    return { success: true, ...value };
                } catch (error) {
                    graph.rollbackBlock(update);
                    throw error;
                } finally {
                    syncing = false;
                }
            },
            dispose() {
                disposed = true;
                for (const [node, method] of thumbnailMethods) node.getThumbnail = method;
                thumbnails.clear();
                thumbnailMethods.clear();
                graph.off("nodeAdded", added);
                graph.off("nodeRemoved", propertyChanged);
                graph.off("nodePropertyChange", propertyChanged);
                scene.eventEmitter.off("selectionChange", changed);
                document.removeEventListener("dblclick", doubleClick, true);
                document.removeEventListener("keydown", keyDown, true);
            },
        };
    };
})();
