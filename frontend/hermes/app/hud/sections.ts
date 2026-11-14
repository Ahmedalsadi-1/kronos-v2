import { APP_ROUTES } from "@hermes/app/routes";
import { SECTIONS } from "@hermes/app/settings/constants";
import { BASE_SETTINGS_VIEWS } from "@hermes/app/settings/views";

export interface HudSection {
    id: string;
    name: string;
    detail: string;
    route: string;
    kind: string;
}

export function hudSections(kronTermSections: readonly { id: string; label: string }[] = []): HudSection[] {
    return [
        ...APP_ROUTES.filter((route) => route.view !== "chat" && route.view !== "settings").map((route) => ({
            id: `page:${route.id}`,
            name: route.id
                .split("-")
                .map((word) => word[0].toUpperCase() + word.slice(1))
                .join(" "),
            detail: "Hermes workspace",
            route: route.path,
            kind: "section",
        })),
        ...BASE_SETTINGS_VIEWS.map((view) => ({
            id: `setting:${view}`,
            name:
                SECTIONS.find((section) => `config:${section.id}` === view)?.label ??
                (
                    { keybinds: "Keyboard shortcuts", keys: "API keys", sessions: "Archived chats" } as Record<
                        string,
                        string
                    >
                )[view] ??
                view[0].toUpperCase() + view.slice(1),
            detail: "Hermes settings",
            route: `/settings?tab=${view}`,
            kind: "setting",
        })),
        ...kronTermSections.map((section) => ({
            id: `kronterm:${section.id}`,
            name: `KronOS ${section.label}`,
            detail: "KronOS settings",
            route: `/settings?tab=kronterm:${section.id}`,
            kind: "setting",
        })),
    ];
}
