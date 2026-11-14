import { createContext, type ReactNode, useContext } from "react";

export interface KronTermSettingsSectionDescriptor {
    id: string;
    label: string;
}

export interface KronTermSettingsHost {
    appearance?: { reducedMotion: boolean };
    renderAppearance?: () => ReactNode;
    renderSection: (sectionId: string) => ReactNode;
    sections: readonly KronTermSettingsSectionDescriptor[];
}

const KronTermSettingsPrefix = "kronterm:";
export const HermesSettingsSavedEvent = "hermes:settings-saved";
export type HermesSettingsSavedDetail = { provider: string; model: string };

const KronTermSettingsRequestEvent = "kronterm:open-settings";
let pendingKronTermSettingsSection: string | null = null;

export function makeKronTermSettingsViewId(sectionId: string): `kronterm:${string}` {
    return `${KronTermSettingsPrefix}${sectionId}`;
}

export function getKronTermSettingsSectionId(viewId: string): string | null {
    return viewId.startsWith(KronTermSettingsPrefix) ? viewId.slice(KronTermSettingsPrefix.length) : null;
}

export function requestKronTermSettings(sectionId: string): void {
    pendingKronTermSettingsSection = sectionId;
    window.dispatchEvent(new CustomEvent(KronTermSettingsRequestEvent, { detail: { sectionId } }));
}

export function consumeKronTermSettingsRequest(): string | null {
    const sectionId = pendingKronTermSettingsSection;
    pendingKronTermSettingsSection = null;
    return sectionId;
}

export { KronTermSettingsRequestEvent };

const KronTermSettingsHostContext = createContext<KronTermSettingsHost | null>(null);

export function KronTermSettingsHostProvider({
    children,
    value,
}: {
    children: ReactNode;
    value: KronTermSettingsHost | null;
}) {
    return <KronTermSettingsHostContext.Provider value={value}>{children}</KronTermSettingsHostContext.Provider>;
}

export function useKronTermSettingsHost(): KronTermSettingsHost | null {
    return useContext(KronTermSettingsHostContext);
}
