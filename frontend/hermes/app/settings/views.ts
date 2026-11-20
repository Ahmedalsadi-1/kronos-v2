import { SECTIONS } from "./constants";
import type { SettingsView } from "./types";

export const BASE_SETTINGS_VIEWS: readonly SettingsView[] = [
    ...SECTIONS.map((section) => `config:${section.id}` as SettingsView),
    "kronrender",
    "kronflow",
    "integrations",
    "quick-entry",
    "companion",
    "providers",
    "gateway",
    "connections",
    "computers",
    "delegation",
    "keybinds",
    "keys",
    "notifications",
    "billing",
    "plugins",
    "skills",
    "sessions",
    "about",
];
