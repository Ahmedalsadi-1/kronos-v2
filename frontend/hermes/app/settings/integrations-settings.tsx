// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0
import type { OverlayNavGroup } from "@hermes/app/overlays/overlay-split-layout";
import { Button } from "@hermes/components/ui/button";
import { Globe, Layers3, Wrench } from "@hermes/lib/icons";
import { ListRow, SettingsContent, SettingsSection } from "./primitives";

const IntegrationGroups = [
    {
        title: "Workspace tools",
        icon: Layers3,
        ids: [
            "kronrender",
            "kronflow",
            "kronterm:canvas",
            "kronterm:widgets",
            "kronterm:theme",
            "kronterm:browser",
            "kronterm:browser-sessions",
            "kronterm:browser-setup",
        ],
    },
    {
        title: "Models & connections",
        icon: Globe,
        ids: ["providers", "connections", "gateway", "keys", "kronterm:github", "kronterm:git"],
    },
    {
        title: "Agent capabilities",
        icon: Wrench,
        ids: ["skills", "plugins", "computers", "config:voice", "delegation"],
    },
];

export function IntegrationsSettings({ destinations }: { destinations: OverlayNavGroup[] }) {
    return (
        <SettingsContent>
            <p className="mb-7 text-sm leading-6 text-muted-foreground">
                Connect your models, apps, and workspace tools. Each section opens its existing settings.
            </p>
            {IntegrationGroups.map((group) => {
                const entries = group.ids.flatMap((id) => {
                    const destination = destinations.find((item) => item.id === id);
                    return destination ? [destination] : [];
                });
                if (!entries.length) return null;
                return (
                    <SettingsSection key={group.title} title={group.title} icon={group.icon}>
                        {entries.map((entry) => (
                            <ListRow
                                key={entry.id}
                                title={entry.label}
                                action={
                                    <Button variant="ghost" className="cursor-pointer" onClick={entry.onSelect}>
                                        Configure<span className="sr-only"> {entry.label}</span>
                                    </Button>
                                }
                            />
                        ))}
                    </SettingsSection>
                );
            })}
        </SettingsContent>
    );
}
