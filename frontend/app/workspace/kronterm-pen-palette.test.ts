import type { PaletteContribution } from "@hermes/app/command-palette/contrib";
import { expect, it, vi } from "vitest";
import { penCommandContributions, type PenCanvasCommand } from "./kronterm-pen-palette";

it("keeps native labels, shortcuts, state and availability in existing palette contributions", () => {
    const run = vi.fn();
    const command: PenCanvasCommand = {
        id: "group",
        label: "Group selection",
        category: "Arrange",
        keywords: ["container"],
        shortcut: ["Mod", "G"],
        enabled: false,
        unavailableHint: "Select layers first",
        keepOpen: false,
    };
    const row = penCommandContributions("workspace-a", [command], run)[0];
    const data = row.data as PaletteContribution;
    expect(row.id).toBe("kronos.canvas.workspace-a.group");
    expect(data.label).toBe("Group selection");
    expect(data.comboHint).toBe("mod+g");
    expect(data.disabled).toBe(true);
    expect(data.detail()).toBe("Select layers first");
    data.run();
    expect(run).not.toHaveBeenCalled();
    const enabled = penCommandContributions("workspace-a", [{ ...command, enabled: true, checked: true }], run)[0]
        .data as PaletteContribution;
    enabled.run();
    expect(run).toHaveBeenCalledExactlyOnceWith("group");
    expect(enabled.active).toBe(true);
    expect(penCommandContributions("workspace-b", [command], run)[0].id).not.toBe(row.id);
});
