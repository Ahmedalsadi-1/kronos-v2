// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    window.createKronosPenCommands = (scene, engine, emit) => {
        const native = engine.__kronosPenCommands;
        if (!native) throw new Error("The Pen command catalog is unavailable. Restage the editor runtime.");
        let disposed = false;
        let queued = false;
        let previous;
        const entries = () => native.entries().filter((entry) => native.isOffered(scene, entry));
        const describe = (entry) => {
            const availability = native.availability(scene, entry);
            const setting = entry.kind === 1 ? entry.setting : entry.action.setting;
            return {
                id: entry.id,
                label: native.label(scene, entry),
                category: entry.categoryLabel,
                keywords: entry.keywords ?? [],
                shortcut: native.shortcut(entry) ?? [],
                enabled: availability === 2,
                unavailableHint:
                    availability === 1
                        ? "View only"
                        : availability === 0 && entry.action?.unavailableHint
                          ? native.formatMessage(entry.action.unavailableHint)
                          : undefined,
                checked: setting != null ? !!scene.config.data[setting] : undefined,
                keepOpen: setting != null,
            };
        };
        const get = () => ({ commands: entries().map(describe) });
        const publish = () => {
            queued = false;
            if (disposed) return;
            const snapshot = get();
            const signature = JSON.stringify(snapshot);
            if (signature === previous) return;
            previous = signature;
            emit({ type: "commands-changed", ...snapshot });
        };
        const schedule = () => {
            if (queued || disposed) return;
            queued = true;
            queueMicrotask(publish);
        };
        const originalEmit = scene.eventEmitter.emit;
        const routedEmit = function (name, ...args) {
            if (name === "uiCommand" && args[0] === 0) {
                publish();
                emit({ type: "command-palette-open" });
                return;
            }
            if (name === "uiCommand" && args[0] === 1) {
                emit({ type: "open-settings" });
                return;
            }
            return originalEmit.call(this, name, ...args);
        };
        scene.eventEmitter.emit = routedEmit;
        const keydown = (event) => {
            if (event.code !== "Space" || !event.shiftKey || event.altKey || event.metaKey === event.ctrlKey) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat) return;
            publish();
            emit({ type: "command-palette-open" });
        };
        engine.addEventListener?.("keydown", keydown, true);
        scene.eventEmitter.on("actionStateChangeDebounced", schedule);
        scene.config.on("change", schedule);
        schedule();
        return {
            get,
            run({ id }) {
                if (disposed) throw new Error("The canvas command host is closed.");
                const entry = entries().find((item) => item.id === id);
                if (!entry) throw new Error("This command is not available in the current canvas.");
                const command = describe(entry);
                if (!command.enabled)
                    throw new Error(command.unavailableHint || "This command is currently unavailable.");
                if (entry.kind === 0) {
                    scene.actions.run(entry.action, { source: 2 });
                } else if (entry.kind === 1) {
                    const value = !scene.config.data[entry.setting];
                    scene.config.set(entry.setting, value);
                    scene.telemetry("document-action", {
                        action: "toggle-setting",
                        setting: entry.setting,
                        value,
                        source: "command-palette",
                    });
                } else {
                    throw new Error("Unknown native command type.");
                }
                schedule();
                return { success: true };
            },
            dispose() {
                disposed = true;
                scene.eventEmitter.off("actionStateChangeDebounced", schedule);
                scene.config.off("change", schedule);
                engine.removeEventListener?.("keydown", keydown, true);
                if (scene.eventEmitter.emit === routedEmit) scene.eventEmitter.emit = originalEmit;
            },
        };
    };
})();
