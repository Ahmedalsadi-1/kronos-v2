// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { $composerPosition, $hudComposerPosition } from "@hermes/store/composer-position";
import { $hudMode } from "@hermes/store/hud";
import { useStore } from "@nanostores/react";
import type { ComponentProps } from "react";
import "./position.css";

export function ComposerPositionSurface(props: ComponentProps<"div">) {
    const position = useStore($composerPosition);
    const hudMode = useStore($hudMode);
    return <div {...props} data-composer-position={hudMode ? "bottom" : position} />;
}

export function ComposerPositionToggle({ hud = false }: { hud?: boolean }) {
    const preference = hud ? $hudComposerPosition : $composerPosition;
    const position = useStore(preference);
    const label = position === "top" ? "Move composer to bottom" : "Move composer to top";
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            data-slot="composer-position-toggle"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => preference.set(position === "top" ? "bottom" : "top")}
        >
            <span aria-hidden="true">{position === "top" ? "↓" : "↑"}</span>
        </button>
    );
}
