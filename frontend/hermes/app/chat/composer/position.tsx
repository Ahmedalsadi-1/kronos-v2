// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { Button } from "@hermes/components/ui/button";
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
        <Button
            type="button"
            aria-label={label}
            title={label}
            data-slot="composer-position-toggle"
            size="icon-xs"
            variant="ghost"
            onClick={() => preference.set(position === "top" ? "bottom" : "top")}
        >
            <span aria-hidden="true">{position === "top" ? "↓" : "↑"}</span>
        </Button>
    );
}
