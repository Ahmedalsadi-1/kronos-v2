// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowLeft, ArrowRight, RotateCw, X } from "lucide-react";

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
            {icon === "chevron-left" ? (
                <ArrowLeft size={12} />
            ) : icon === "chevron-right" ? (
                <ArrowRight size={12} />
            ) : icon === "xmark" ? (
                <X size={12} />
            ) : (
                <RotateCw size={12} />
            )}
        </button>
    );
}

export function BrowserNavigationRow({
    addressSlot,
    controls,
    reloadIcon = "rotate-right",
    reloadLabel = "Reload",
    beforeAddress,
    children,
}: {
    addressSlot: React.ReactNode;
    controls?: Partial<BrowserNavigationControls>;
    reloadIcon?: string;
    reloadLabel?: string;
    beforeAddress?: React.ReactNode;
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
            {beforeAddress}
            <div
                className="webview-omnibox"
                onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('input,button,[role="listbox"]')) return;
                    event.currentTarget.querySelector("input")?.focus();
                }}
            >
                {addressSlot}
            </div>
            {children}
        </div>
    );
}

export const BrowserNavigationControlRow = BrowserNavigationRow;

export function BrowserChromeToolbar({ children, preview }: { children: React.ReactNode; preview?: boolean }) {
    return (
        <div
            className="webview-browser-chrome"
            data-browser-preview={preview || undefined}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {children}
        </div>
    );
}
