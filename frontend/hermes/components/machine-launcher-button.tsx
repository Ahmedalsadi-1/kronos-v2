// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@hermes/components/ui/button";
import { Codicon } from "@hermes/components/ui/codicon";
import { Tip } from "@hermes/components/ui/tooltip";
import { useState } from "react";

export function MachineLauncherButton() {
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const launcher = window.hermesDesktop?.krontermSurfaces?.openMachines;
    if (!launcher) return null;
    return (
        <div className="relative shrink-0">
            <Tip label="Devices · Desktop, Android and iPhone">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Open machine launcher"
                    disabled={busy}
                    className="size-(--composer-control-size,2rem) cursor-pointer rounded-md text-(--ui-text-tertiary)"
                    onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                            const result = await launcher();
                            if (!result.ok) throw new Error(result.error || "Unable to open the machine launcher.");
                        } catch (failure) {
                            setError(
                                failure instanceof Error ? failure.message : "Unable to open the machine launcher."
                            );
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <Codicon name="vm" size="0.95rem" />
                </Button>
            </Tip>
            {error && (
                <p
                    role="alert"
                    className="absolute right-0 z-50 w-64 rounded-lg border border-(--ui-border) bg-(--ui-bg) p-3 text-xs"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
