// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
(() => {
    const fields = [
        { key: "snapToObjects", group: "Canvas", kind: "boolean", label: "Snap to objects" },
        { key: "roundToPixels", group: "Canvas", kind: "boolean", label: "Snap to pixel grid" },
        { key: "showPixelGrid", group: "Canvas", kind: "boolean", label: "Show pixel grid" },
        { key: "showCommentMarkers", group: "Canvas", kind: "boolean", label: "Show comment markers" },
        {
            key: "scrollWheelZoom",
            group: "Canvas",
            kind: "boolean",
            label: "Use scroll wheel to zoom",
            description: "Use the wheel to zoom instead of panning the canvas.",
        },
        { key: "invertZoomDirection", group: "Canvas", kind: "boolean", label: "Invert zoom direction" },
        {
            key: "smallNudge",
            group: "Canvas",
            kind: "number",
            label: "Arrow key nudge",
            description: "Distance in canvas pixels.",
            min: 0.01,
            max: 10000,
        },
        {
            key: "bigNudge",
            group: "Canvas",
            kind: "number",
            label: "Shift + arrow key nudge",
            description: "Distance in canvas pixels.",
            min: 0.01,
            max: 10000,
        },
        {
            key: "animationsAndEffectsEnabled",
            group: "Playback",
            kind: "boolean",
            label: "Animations and effects",
            description: "Turn off native canvas effects to reduce GPU and CPU use.",
        },
        {
            key: "presentationZoom",
            group: "Playback",
            kind: "enum",
            label: "Presentation zoom",
            options: [
                { value: 0, label: "Fit" },
                { value: 1, label: "Actual size" },
            ],
        },
        {
            key: "browserPresentationSize",
            group: "Playback",
            kind: "enum",
            label: "Browser presentation size",
            options: [
                { value: 0, label: "Actual size" },
                { value: 1, label: "Fill" },
            ],
        },
        {
            key: "browserImportIncludeMetadata",
            group: "Import and export",
            kind: "boolean",
            label: "Include HTML metadata on import",
        },
        {
            key: "codeExportFormatter",
            group: "Import and export",
            kind: "enum",
            label: "Code format",
            options: [
                { value: "html-tailwind", label: "HTML + Tailwind" },
                { value: "html-css", label: "HTML + CSS" },
            ],
        },
        {
            key: "codeExportAssetMode",
            group: "Import and export",
            kind: "enum",
            label: "Exported image paths",
            options: [
                { value: "relative", label: "Relative paths" },
                { value: "absolute", label: "Absolute paths" },
                { value: "embed", label: "Embed images" },
            ],
        },
        {
            key: "codeExportIncludeHtmlScaffold",
            group: "Import and export",
            kind: "boolean",
            label: "Include HTML document structure",
        },
        {
            key: "codeExportCenterHtmlBodyContents",
            group: "Import and export",
            kind: "boolean",
            label: "Center exported content",
        },
        {
            key: "codeExportIncludeLayerNames",
            group: "Import and export",
            kind: "boolean",
            label: "Include layer names",
        },
        { key: "codeExportIncludeLayerIds", group: "Import and export", kind: "boolean", label: "Include layer IDs" },
    ];

    globalThis.createKronosPenSettings = (scene, emit) => {
        const config = scene.config;
        if (!config?.data || typeof config.set !== "function")
            throw new Error("Native canvas settings are unavailable");
        const supported = fields.filter((field) => Object.prototype.hasOwnProperty.call(config.data, field.key));
        const read = () => ({
            scope: "desktop-profile",
            fields: supported,
            values: Object.fromEntries(supported.map(({ key }) => [key, config.data[key]])),
        });
        const changed = (key) => {
            if (supported.some((field) => field.key === key)) emit({ type: "settings", settings: read() });
        };
        config.on("change", changed);
        return {
            read,
            update(patch) {
                if (!patch || typeof patch !== "object" || Array.isArray(patch))
                    throw new Error("Invalid canvas settings update");
                for (const [key, value] of Object.entries(patch)) {
                    const field = supported.find((field) => field.key === key);
                    const valid =
                        field &&
                        ((field.kind === "boolean" && typeof value === "boolean") ||
                            (field.kind === "number" &&
                                typeof value === "number" &&
                                Number.isFinite(value) &&
                                value >= field.min &&
                                value <= field.max) ||
                            (field.kind === "enum" && field.options.some((option) => option.value === value)));
                    if (!valid) throw new Error(`Invalid canvas setting: ${key}`);
                }
                for (const [key, value] of Object.entries(patch)) {
                    if (config.data[key] !== value) config.set(key, value);
                }
                scene.requestFrame();
                return read();
            },
            dispose() {
                config.off("change", changed);
            },
        };
    };
})();
