// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0
import { atoms } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { ListRow, SettingsContent, SettingsSection, ToggleRow } from "@hermes/app/settings/primitives";
import { Input } from "@hermes/components/ui/input";
import { SegmentedControl } from "@hermes/components/ui/segmented-control";
import { LayoutDashboard, Monitor, Terminal } from "@hermes/lib/icons";
import { useAtomValue } from "jotai";
import { useState } from "react";

const LayoutOptions = [
    { id: "os", label: "OS" },
    { id: "widgets", label: "Widgets" },
    { id: "tabs", label: "Tabs" },
    { id: "canvas", label: "Canvas" },
    { id: "web", label: "Web" },
];
const WidgetOptions = [
    { id: "web", label: "Browser" },
    { id: "term", label: "Terminal" },
    { id: "preview", label: "Files" },
];

export function KronSettingsWorkspaceContent() {
    const config = useAtomValue(atoms.fullConfigAtom);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const settings = config?.settings ?? {};
    const save = async (key: string, value: string | number | boolean) => {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            await RpcApi.SetConfigCommand(TabRpcClient, { [key]: value });
            setMessage("Workspace preferences saved.");
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not save workspace preferences.");
        } finally {
            setBusy(false);
        }
    };
    if (!config)
        return (
            <p role="status" className="p-8 text-sm">
                Loading workspace preferences...
            </p>
        );
    return (
        <SettingsContent>
            <fieldset disabled={busy} className="min-w-0">
                <SettingsSection title="Workspace" icon={LayoutDashboard}>
                    <ListRow
                        title="Workspace layout"
                        wide
                        action={
                            <SegmentedControl
                                options={LayoutOptions}
                                value={settings["app:layoutmode"] ?? "os"}
                                onChange={(value) => void save("app:layoutmode", value)}
                            />
                        }
                    />
                    <ListRow
                        title="New widget"
                        wide
                        action={
                            <SegmentedControl
                                options={
                                    WidgetOptions.some(
                                        (option) => option.id === (settings["app:defaultnewblock"] ?? "web")
                                    )
                                        ? WidgetOptions
                                        : [
                                              ...WidgetOptions,
                                              {
                                                  id: settings["app:defaultnewblock"],
                                                  label: settings["app:defaultnewblock"],
                                              },
                                          ]
                                }
                                value={settings["app:defaultnewblock"] ?? "web"}
                                onChange={(value) => void save("app:defaultnewblock", value)}
                            />
                        }
                    />
                    <ListRow
                        title="Space between widgets"
                        action={
                            <Input
                                aria-label="Space between widgets"
                                className="w-24"
                                key={String(settings["window:tilegapsize"] ?? 3)}
                                type="number"
                                min={0}
                                step={1}
                                defaultValue={settings["window:tilegapsize"] ?? 3}
                                onBlur={(event) => {
                                    const value = Number(event.target.value);
                                    if (event.target.value.trim() && Number.isSafeInteger(value) && value >= 0) {
                                        if (value !== (settings["window:tilegapsize"] ?? 3))
                                            void save("window:tilegapsize", value);
                                        return;
                                    }
                                    event.target.value = String(settings["window:tilegapsize"] ?? 3);
                                    setError("Enter a whole number of zero or more.");
                                }}
                            />
                        }
                    />
                    <ToggleRow
                        label="Show widget help"
                        checked={settings["widget:showhelp"] ?? true}
                        onChange={(value) => void save("widget:showhelp", value)}
                    />
                </SettingsSection>
                <SettingsSection title="Windows & tabs" icon={Monitor}>
                    <ToggleRow
                        label="Restore last window"
                        checked={settings["window:savelastwindow"] ?? true}
                        onChange={(value) => void save("window:savelastwindow", value)}
                    />
                    <ToggleRow
                        label="Confirm before closing a window"
                        checked={settings["window:confirmclose"] ?? true}
                        onChange={(value) => void save("window:confirmclose", value)}
                    />
                    <ToggleRow
                        label="Confirm before closing a tab"
                        checked={settings["tab:confirmclose"] ?? false}
                        onChange={(value) => void save("tab:confirmclose", value)}
                    />
                </SettingsSection>
                <SettingsSection title="Terminal defaults" icon={Terminal}>
                    <ToggleRow
                        label="Copy on select"
                        checked={settings["term:copyonselect"] ?? true}
                        onChange={(value) => void save("term:copyonselect", value)}
                    />
                    <ToggleRow
                        label="Blink cursor"
                        checked={settings["term:cursorblink"] ?? false}
                        onChange={(value) => void save("term:cursorblink", value)}
                    />
                    <ToggleRow
                        label="Bell indicator"
                        checked={settings["term:bellindicator"] ?? true}
                        onChange={(value) => void save("term:bellindicator", value)}
                    />
                </SettingsSection>
            </fieldset>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <p role="status" className="mt-3 text-xs text-muted-foreground">
                {busy ? "Saving..." : message}
            </p>
        </SettingsContent>
    );
}
