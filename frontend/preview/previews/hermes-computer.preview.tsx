// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ComputerWidget } from "@hermes/computer/computer-widget";
import "@hermes/styles.css";

export function HermesComputerPreview() {
    return (
        <div className="fixed inset-x-0 bottom-0 top-10 bg-background text-foreground">
            <ComputerWidget />
        </div>
    );
}
