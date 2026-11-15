// @vitest-environment jsdom
import { $workspaceCanvasPanels } from "@hermes/lib/kronterm-sidebar";
import { afterEach, expect, it } from "vitest";
import {
    $commandPaletteOpen,
    $commandPalettePage,
    $workflowPickerSource,
    closeCommandPalette,
    openCommandPalette,
    openCommandPalettePopup,
} from "./command-palette";

afterEach(() => {
    closeCommandPalette();
    $workspaceCanvasPanels.set(false);
});

it("opens the existing popup from the canvas and retires any embedded workflow picker", () => {
    $workspaceCanvasPanels.set(true);
    openCommandPalette();
    expect($workflowPickerSource.get()).toBe("commands");
    expect($commandPaletteOpen.get()).toBe(false);
    $commandPalettePage.set("theme");
    openCommandPalettePopup();
    expect($workflowPickerSource.get()).toBeNull();
    expect($commandPalettePage.get()).toBeNull();
    expect($commandPaletteOpen.get()).toBe(true);
    closeCommandPalette();
    expect($commandPaletteOpen.get()).toBe(false);
});
