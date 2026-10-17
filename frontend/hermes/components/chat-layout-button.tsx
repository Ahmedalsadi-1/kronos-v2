// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@hermes/components/ui/button";
import { Codicon } from "@hermes/components/ui/codicon";
import { Tip } from "@hermes/components/ui/tooltip";

export function ChatLayoutButton() {
    const toggle = window.hermesDesktop?.krontermSurfaces?.toggleChatLayout;
    if (!toggle || new URLSearchParams(window.location.search).get("nativeNotch") !== "1") return null;
    return (
        <Tip label="Switch between centered chat and side panel">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Switch chat layout"
                onClick={toggle}
                className="size-(--composer-control-size,2rem) cursor-pointer rounded-md text-(--ui-text-tertiary)"
            >
                <Codicon name="layout-sidebar-left" size="0.95rem" />
            </Button>
        </Tip>
    );
}
