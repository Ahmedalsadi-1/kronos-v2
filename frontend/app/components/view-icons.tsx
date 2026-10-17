// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import type { ReactElement } from "react";

export const ViewIconPrefix = "view:";

export function viewIconId(view: string): string {
    return `${ViewIconPrefix}${view}`;
}

const TerminalIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#15171b" />
        <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="rgba(255,255,255,0.14)" />
        <path
            d="M8 10.5 13.5 16 8 21.5"
            fill="none"
            stroke="#f4f5f7"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path d="M15.5 21.5H24" stroke="#f4f5f7" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
);

const BrowserIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
            <linearGradient id="kt-browser-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5aa9ff" />
                <stop offset="1" stopColor="#1f6fe0" />
            </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="15" fill="url(#kt-browser-bg)" />
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.8" />
        <ellipse
            cx="16"
            cy="16"
            rx="4.6"
            ry="10.5"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.92"
            strokeWidth="1.6"
        />
        <path d="M5.5 16h21M7.4 11.2h17.2M7.4 20.8h17.2" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.6" />
    </svg>
);

const FilesIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
            <linearGradient id="kt-folder-back" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4aa3f5" />
                <stop offset="1" stopColor="#2f86dc" />
            </linearGradient>
            <linearGradient id="kt-folder-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8fcbff" />
                <stop offset="1" stopColor="#5eb0f6" />
            </linearGradient>
        </defs>
        <path
            d="M3 9.5A2.5 2.5 0 0 1 5.5 7h6.2a2.5 2.5 0 0 1 1.9.9l1.6 1.9h11.3A2.5 2.5 0 0 1 29 12.3V24a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24z"
            fill="url(#kt-folder-back)"
        />
        <path
            d="M3 13.5A2.5 2.5 0 0 1 5.5 11h21A2.5 2.5 0 0 1 29 13.5V24a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24z"
            fill="url(#kt-folder-front)"
        />
        <path d="M3 14h26" stroke="#ffffff" strokeOpacity="0.45" />
    </svg>
);

const AppStreamIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#2b2f36" />
        <rect x="6" y="8" width="20" height="13" rx="2.5" fill="#dfe5ee" />
        <rect x="8" y="10" width="16" height="9" rx="1.2" fill="#3d8bfd" />
        <path d="M12 25h8" stroke="#dfe5ee" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const SystemIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#f2f3f5" stroke="rgba(15,15,15,0.08)" />
        <path d="M7 20.5a9 9 0 0 1 18 0" fill="none" stroke="#3d8bfd" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M16 20.5 21 13.5" stroke="#1b1e24" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="16" cy="20.5" r="1.8" fill="#1b1e24" />
    </svg>
);

const CanvasIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#f2f3f5" stroke="rgba(15,15,15,0.08)" />
        <rect x="7" y="7" width="8" height="8" rx="2" fill="#3d8bfd" />
        <rect x="17" y="7" width="8" height="8" rx="2" fill="#a9c9f5" />
        <rect x="7" y="17" width="8" height="8" rx="2" fill="#a9c9f5" />
        <rect x="17" y="17" width="8" height="8" rx="2" fill="#3d8bfd" />
    </svg>
);

export const KronPetIcon = () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
            d="M7 10 9.5 4.5 14 9h4l4.5-4.5L25 10"
            fill="#f6f6f8"
            stroke="#1b1e24"
            strokeWidth="1.4"
            strokeLinejoin="round"
        />
        <rect x="4" y="9" width="24" height="19" rx="9" fill="#f6f6f8" stroke="#1b1e24" strokeWidth="1.4" />
        <rect x="8" y="13" width="16" height="10" rx="4" fill="#2f333c" />
        <path
            d="M11 17.5c.9 1.1 2.1 1.1 3 0M18 17.5c.9 1.1 2.1 1.1 3 0"
            fill="none"
            stroke="#f6f6f8"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
        <path d="M15.2 20.2h1.6" stroke="#f6f6f8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
);

const ViewIcons: Record<string, () => ReactElement> = {
    term: TerminalIcon,
    web: BrowserIcon,
    preview: FilesIcon,
    hermes: KronPetIcon,
    appstream: AppStreamIcon,
    computers: AppStreamIcon,
    sysinfo: SystemIcon,
    kronoscanvas: CanvasIcon,
};

export function hasViewIcon(view: string): boolean {
    return ViewIcons[view] != null;
}

export function ViewIcon({ view, className }: { view: string; className?: string }) {
    const Icon = ViewIcons[view];
    if (!Icon) return null;
    return (
        <span className={cn("kt-view-icon", className)} data-view={view}>
            <Icon />
        </span>
    );
}
