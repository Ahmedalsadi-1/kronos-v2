// Copyright 2026, Command Line Inc. SPDX-License-Identifier: Apache-2.0
import "@/app/tab/os-hermes-settings-theme.css";
import { KronSettingsBrowserSessionsContent } from "@/app/view/kronsettings/kronsettings-browser-sessions";
import { KronSettingsBrowserSetup } from "@/app/view/kronsettings/kronsettings-browser-setup";
import { KronSettingsWorkspaceContent } from "@/app/view/kronsettings/kronsettings-workspace";
import type { BrowserPreferences } from "@hermes/app/settings/browser-preferences";
import { BrowserSettings } from "@hermes/app/settings/browser-settings";
import { IntegrationsSettings } from "@hermes/app/settings/integrations-settings";
import { PenCanvasSettings } from "@hermes/app/settings/pen-canvas-settings";
import { ListRow, SettingsContent, SettingsSection, ToggleRow } from "@hermes/app/settings/primitives";
import "@hermes/app/settings/settings-ios.css";
import { SettingsNavigation } from "@hermes/app/settings/settings-navigation";
import { WorkspaceToolSettings } from "@hermes/app/settings/workspace-tool-settings";
import { WorkspaceTools } from "@hermes/app/settings/workspace-tools";
import { Button } from "@hermes/components/ui/button";
import {
    Archive,
    Bell,
    Globe,
    Info,
    Keyboard,
    LayoutDashboard,
    Lock,
    Network,
    Palette,
    Pencil,
    Upload,
} from "@hermes/lib/icons";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "./aside-settings-preview.css";
import { resetSettingsPreview } from "./mock/aside-settings-api";
import "./settings-preview.css";

const Entries = [
    { id: "integrations", label: "Integrations", icon: Network },
    ...WorkspaceTools,
    { id: "kronterm:widgets", label: "Workspace & widgets", icon: LayoutDashboard },
    { id: "kronterm:canvas", label: "KronCanvas", icon: Pencil },
    { id: "kronterm:browser-setup", label: "Import & passwords", icon: Upload },
    { id: "config:appearance", label: "Appearance", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "keybinds", label: "Keyboard shortcuts", icon: Keyboard },
    { id: "kronterm:browser", label: "Browser", icon: Globe },
    { id: "kronterm:browser-sessions", label: "Browser sessions", icon: Archive },
    { id: "kronterm:privacy", label: "Security & privacy", icon: Lock },
    { id: "about", label: "About this preview", icon: Info },
];
const InitialPreferences: BrowserPreferences = {
    "web:defaulturl": "about:blank",
    "web:defaultsearch": "https://www.google.com/search?q={query}",
    "web:openlinksinternally": true,
};
const ControlClass = "preview-select";

function Preview() {
    const [view, setView] = useState("kronterm:browser");
    const [theme, setTheme] = useState("dark");
    const [preferences, setPreferences] = useState(InitialPreferences);
    const [generation, setGeneration] = useState(0);
    const [notifications, setNotifications] = useState(true);
    const [sounds, setSounds] = useState(false);
    const [permissions, setPermissions] = useState<Record<string, string>>({});
    const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
    const [density, setDensity] = useState("Comfortable");
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.dataset.previewTheme = theme;
    }, [theme]);
    useEffect(() => {
        document.documentElement.dataset.previewDensity = density;
    }, [density]);
    const open = (id: string) => setView(id);
    return (
        <div className="aside-preview-stage">
            <div className="aside-preview-notice">
                <span>
                    <span className="preview-status-dot" /> Local design preview
                </span>
                <span>Sample sessions. Changes stay in this page.</span>
                <button
                    type="button"
                    onClick={() => {
                        resetSettingsPreview();
                        setPreferences(InitialPreferences);
                        setGeneration((value) => value + 1);
                        setPermissions({});
                        setShortcuts({});
                        setNotifications(true);
                        setSounds(false);
                        setDensity("Comfortable");
                    }}
                >
                    Reset preview
                </button>
            </div>
            <div
                className="aside-preview-popup os-hermes-settings-dialog"
                data-os-hermes-settings=""
                data-color-scheme={theme}
            >
                <header className="aside-preview-titlebar os-hermes-settings-titlebar">
                    <span className="preview-window-symbol" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                    <span>KronOS Settings</span>
                    <button
                        type="button"
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? "Light" : "Dark"}
                    </button>
                </header>
                <div className="kron-settings-ios aside-preview-layout" key={generation}>
                    <SettingsNavigation
                        groups={Entries.map((entry) => ({
                            ...entry,
                            active: entry.id === view,
                            onSelect: () => open(entry.id),
                        }))}
                    />
                    <main data-overlay-main="" className="min-h-0 min-w-0 flex flex-col">
                        <header data-settings-page-header="">
                            <h1>{Entries.find((entry) => entry.id === view)?.label}</h1>
                        </header>
                        {view === "integrations" ? (
                            <IntegrationsSettings
                                destinations={Entries.map((entry) => ({
                                    ...entry,
                                    active: entry.id === view,
                                    onSelect: () => open(entry.id),
                                }))}
                            />
                        ) : view === "kronrender" || view === "kronflow" ? (
                            <WorkspaceToolSettings toolId={view} />
                        ) : view === "kronterm:widgets" ? (
                            <KronSettingsWorkspaceContent />
                        ) : view === "kronterm:canvas" ? (
                            <PenCanvasSettings
                                request={async () => {
                                    throw new Error("Open KronOS desktop to connect to the active canvas.");
                                }}
                            />
                        ) : view === "kronterm:browser-setup" ? (
                            <SettingsContent>
                                <KronSettingsBrowserSetup />
                            </SettingsContent>
                        ) : view === "kronterm:browser" ? (
                            <BrowserSettings
                                initial={preferences}
                                save={async (value) => setPreferences(value)}
                                onOpenSessions={() => open("kronterm:browser-sessions")}
                                extraContent={<KronSettingsBrowserSetup />}
                            />
                        ) : view === "kronterm:browser-sessions" ? (
                            <KronSettingsBrowserSessionsContent />
                        ) : view === "config:appearance" ? (
                            <SettingsContent>
                                <p className="mb-7 text-sm leading-6 text-muted-foreground">
                                    A quieter home for your workspace. These preview controls apply to this page.
                                </p>
                                <SettingsSection title="Appearance" icon={Palette}>
                                    <ListRow
                                        title="Theme"
                                        description="Choose how KronOS looks."
                                        action={
                                            <select
                                                className={ControlClass}
                                                aria-label="Theme"
                                                value={theme}
                                                onChange={(event) => setTheme(event.target.value)}
                                            >
                                                <option value="dark">Dark</option>
                                                <option value="light">Light</option>
                                            </select>
                                        }
                                    />
                                    <ListRow
                                        title="Density"
                                        description="Adjust the spacing of the settings rows."
                                        action={
                                            <select
                                                className={ControlClass}
                                                aria-label="Density"
                                                value={density}
                                                onChange={(event) => {
                                                    setDensity(event.target.value);
                                                }}
                                            >
                                                <option>Comfortable</option>
                                                <option>Compact</option>
                                            </select>
                                        }
                                    />
                                </SettingsSection>
                                <SettingsSection title="Keyboard shortcuts" icon={Keyboard}>
                                    <ListRow
                                        title="Make the workspace yours"
                                        description="Review workspace and browser shortcut assignments."
                                        action={
                                            <Button
                                                variant="outline"
                                                className="cursor-pointer"
                                                onClick={() => open("keybinds")}
                                            >
                                                Configure
                                            </Button>
                                        }
                                    />
                                </SettingsSection>
                            </SettingsContent>
                        ) : view === "notifications" ? (
                            <SettingsContent>
                                <SettingsSection title="Notifications" icon={Bell}>
                                    <ToggleRow
                                        label="Task notifications"
                                        description="Show a notification when an agent task finishes."
                                        checked={notifications}
                                        onChange={setNotifications}
                                    />
                                    <ToggleRow
                                        label="Notification sounds"
                                        description="Play a sound when a task needs your attention."
                                        checked={sounds}
                                        onChange={setSounds}
                                    />
                                </SettingsSection>
                                <p className="text-sm text-muted-foreground">
                                    Preview preferences only. No system notification permission is requested.
                                </p>
                            </SettingsContent>
                        ) : view === "keybinds" ? (
                            <SettingsContent>
                                <p className="mb-7 text-sm leading-6 text-muted-foreground">
                                    Edit an example assignment to see the controls. Shortcuts are not registered by this
                                    preview.
                                </p>
                                <SettingsSection title="Workspace" icon={Keyboard}>
                                    {[
                                        ["Command center", "Cmd + Shift + Space"],
                                        ["Settings", "Cmd + ,"],
                                    ].map(([label, value]) => (
                                        <ListRow
                                            key={label}
                                            title={label}
                                            action={
                                                <input
                                                    className={ControlClass}
                                                    aria-label={label}
                                                    value={shortcuts[label] ?? value}
                                                    onChange={(event) =>
                                                        setShortcuts((current) => ({
                                                            ...current,
                                                            [label]: event.target.value,
                                                        }))
                                                    }
                                                />
                                            }
                                        />
                                    ))}
                                </SettingsSection>
                                <SettingsSection title="Browser" icon={Globe}>
                                    {[
                                        ["New tab", "Cmd + T"],
                                        ["Focus address bar", "Cmd + L"],
                                        ["Find on page", "Cmd + F"],
                                    ].map(([label, value]) => (
                                        <ListRow
                                            key={label}
                                            title={label}
                                            action={
                                                <input
                                                    className={ControlClass}
                                                    aria-label={label}
                                                    value={shortcuts[label] ?? value}
                                                    onChange={(event) =>
                                                        setShortcuts((current) => ({
                                                            ...current,
                                                            [label]: event.target.value,
                                                        }))
                                                    }
                                                />
                                            }
                                        />
                                    ))}
                                </SettingsSection>
                            </SettingsContent>
                        ) : view === "kronterm:privacy" ? (
                            <SettingsContent>
                                <p className="mb-7 text-sm leading-6 text-muted-foreground">
                                    Review how browser data and website permissions will be presented.
                                </p>
                                <SettingsSection title="Browsing data" icon={Archive}>
                                    <ListRow
                                        title="Cookies, cache, and website storage"
                                        description="Manage data separately for your Work, Personal, and Private sessions."
                                        action={
                                            <Button
                                                variant="outline"
                                                className="cursor-pointer"
                                                onClick={() => open("kronterm:browser-sessions")}
                                            >
                                                Manage data
                                            </Button>
                                        }
                                    />
                                </SettingsSection>
                                <SettingsSection title="Example site permissions" icon={Lock}>
                                    {["Camera", "Microphone", "Location", "Notifications", "Clipboard"].map((label) => (
                                        <ListRow
                                            key={label}
                                            title={label}
                                            description="Example permission control; applies only to this preview."
                                            action={
                                                <select
                                                    className={ControlClass}
                                                    aria-label={label}
                                                    value={permissions[label] ?? "Ask"}
                                                    onChange={(event) =>
                                                        setPermissions((current) => ({
                                                            ...current,
                                                            [label]: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    <option>Ask</option>
                                                    <option>Allow</option>
                                                    <option>Block</option>
                                                </select>
                                            }
                                        />
                                    ))}
                                </SettingsSection>
                            </SettingsContent>
                        ) : (
                            <SettingsContent>
                                <SettingsSection title="Preview scope" icon={Info}>
                                    <ListRow
                                        title="Inspired by Aside’s settings"
                                        description="Searchable navigation, compact grouped rows, neutral surfaces, and section shortcuts. Adapted to KronOS browser sessions."
                                    />
                                    <ListRow
                                        title="Isolated from your workspace"
                                        description="Session counts are sample data. Data clearing only updates this preview. Import parsing stays local; no bookmarks are saved to KronOS."
                                    />
                                    <ListRow
                                        title="Review before integration"
                                        description="The new design and browser pages have not been wired into the settings popup."
                                    />
                                </SettingsSection>
                            </SettingsContent>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}
createRoot(document.getElementById("root")!).render(
    <MemoryRouter>
        <Preview />
    </MemoryRouter>
);
