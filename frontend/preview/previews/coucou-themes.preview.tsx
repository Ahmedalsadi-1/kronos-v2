// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowUp, Check, Palette } from "@hermes/lib/icons";
import "@hermes/styles.css";
import { ThemeProvider, useTheme } from "@hermes/themes/context";
import { CoucouPalettes, coucouPalette } from "@hermes/themes/coucou-palettes";
import { useEffect } from "react";

export function CoucouThemesPreview() {
    return (
        <ThemeProvider>
            <PalettePreview />
        </ThemeProvider>
    );
}

function PalettePreview() {
    const { themeName, setTheme, setMode } = useTheme();
    useEffect(() => {
        setMode("dark");
        if (!coucouPalette(themeName)) setTheme("coucou");
    }, []);
    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 text-foreground">
            <div>
                <h1 className="text-lg font-medium">Coucou appearance</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Every Coucou palette, with the same native type and quiet black surfaces.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="Coucou palettes">
                {CoucouPalettes.map((palette) => (
                    <button
                        key={palette.name}
                        type="button"
                        aria-pressed={themeName === palette.name}
                        onClick={() => setTheme(palette.name)}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm focus-visible:outline-2"
                        style={{
                            background: "#141416",
                            borderColor: themeName === palette.name ? palette.accent : "#2c2c30",
                            outlineColor: palette.accent,
                        }}
                    >
                        <span className="size-5 shrink-0 rounded-full" style={{ background: palette.accent }} />
                        <span className="flex-1">{palette.label}</span>
                        {themeName === palette.name && <Check className="size-4" style={{ color: palette.accent }} />}
                    </button>
                ))}
            </div>
            <section
                data-coucou-hud=""
                className="rounded-3xl border border-white/15 bg-black p-5"
                aria-label="Chat appearance preview"
            >
                <header className="mb-6 flex items-center gap-2 text-sm">
                    <Palette className="size-4" style={{ color: "var(--coucou-accent)" }} />
                    {coucouPalette(themeName)?.label}
                </header>
                <div data-slot="aui_assistant-message-root">
                    <div data-slot="aui_assistant-message-content">
                        <p>Everything has its place.</p>
                        <p className="mt-2 text-sm text-white/55">
                            Your conversation stays open beside the simulator. Workspaces are a click away.
                        </p>
                    </div>
                </div>
                <div data-hud-native-notch="" className="mt-6">
                    <form
                        data-slot="composer-surface"
                        className="flex items-center gap-3 p-3"
                        onSubmit={(event) => event.preventDefault()}
                    >
                        <input
                            data-slot="composer-rich-input"
                            aria-label="Preview message"
                            placeholder="Ask Hermes..."
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                        <button
                            type="submit"
                            aria-label="Preview send"
                            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full"
                            style={{ background: "var(--coucou-accent)", color: "#000" }}
                        >
                            <ArrowUp className="size-4" />
                        </button>
                    </form>
                </div>
            </section>
        </div>
    );
}
