// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { hasViewIcon, ViewIcon, ViewIconPrefix } from "@/app/components/view-icons";
import { cn, makeIconClass } from "@/util/util";

// icon is a "data:..." URL (platform/app metadata), a "view:<name>" built-in surface icon, or an icon-font class.
// When size is omitted, CSS controls the glyph/image size.
export function AppIcon({ icon, size, className }: { icon?: string; size?: number; className?: string }) {
    if (typeof icon !== "string" || icon === "") {
        return (
            <i
                className={cn("fa-solid fa-window-maximize", className)}
                aria-hidden="true"
                style={size != null ? { fontSize: size } : undefined}
            />
        );
    }
    if (icon.startsWith(ViewIconPrefix) && hasViewIcon(icon.slice(ViewIconPrefix.length))) {
        return <ViewIcon view={icon.slice(ViewIconPrefix.length)} className={className} />;
    }
    if (icon.startsWith("data:")) {
        return (
            <img
                src={icon}
                alt=""
                draggable={false}
                className={className}
                style={size != null ? { width: size, height: size } : undefined}
            />
        );
    }
    return (
        <i
            className={cn(makeIconClass(icon, true), className)}
            aria-hidden="true"
            style={size != null ? { fontSize: size } : undefined}
        />
    );
}
