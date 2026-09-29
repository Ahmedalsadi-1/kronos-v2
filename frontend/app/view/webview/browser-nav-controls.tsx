// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export interface BrowserNavigationControls {
    canGoBack: boolean;
    canGoForward: boolean;
    loading: boolean;
    goBack: () => void;
    goForward: () => void;
    reload: () => void;
    navigate: (url: string) => void;
}

interface ControlButtonProps {
    ariaLabel: string;
    disabled?: boolean;
    icon: string;
    onClick: () => void;
    title: string;
}

function BrowserNavButton({ ariaLabel, disabled, icon, onClick, title }: ControlButtonProps) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title}>
            <i className={`fa-solid fa-${icon}`} aria-hidden="true" />
        </button>
    );
}

export function BrowserNavigationRow({
    addressSlot,
    controls,
    reloadIcon = "rotate-right",
    reloadLabel = "Reload",
    children,
}: {
    addressSlot: React.ReactNode;
    controls?: Partial<BrowserNavigationControls>;
    reloadIcon?: string;
    reloadLabel?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="webview-navigation" role="toolbar" aria-label="Browser navigation">
            {controls?.loading ? <div className="webview-loading-bar" aria-hidden="true" /> : null}
            {controls?.goBack ? (
                <BrowserNavButton
                    ariaLabel="Back"
                    disabled={!controls.canGoBack}
                    icon="chevron-left"
                    onClick={controls.goBack}
                    title="Back"
                />
            ) : null}
            {controls?.goForward ? (
                <BrowserNavButton
                    ariaLabel="Forward"
                    disabled={!controls.canGoForward}
                    icon="chevron-right"
                    onClick={controls.goForward}
                    title="Forward"
                />
            ) : null}
            {controls?.reload ? (
                <BrowserNavButton
                    ariaLabel={reloadLabel}
                    icon={reloadIcon}
                    onClick={controls.reload}
                    title={reloadLabel}
                />
            ) : null}
            <div className="webview-omnibox">{addressSlot}</div>
            {children}
        </div>
    );
}
