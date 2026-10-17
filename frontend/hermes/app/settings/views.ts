import { SECTIONS } from "./constants";
import type { SettingsView } from "./types";

export const BASE_SETTINGS_VIEWS: readonly SettingsView[] = [
    ...SECTIONS.map((section) => `config:${section.id}` as SettingsView),
    "providers",
    "gateway",
    "connections",
    "keybinds",
    "keys",
    "notifications",
    "billing",
    "plugins",
    "sessions",
    "about",
];
