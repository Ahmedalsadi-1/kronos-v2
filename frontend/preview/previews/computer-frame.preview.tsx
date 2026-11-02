// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ManagedVncScreen } from "@/app/view/linux-vms/managed-vnc-screen";
import type { LinuxDesktop } from "@/types/linux-desktops";
import { useState } from "react";

export function ComputerFramePreview() {
    const endpoint = new URLSearchParams(window.location.search).get("viewer") || "";
    const [owner, setOwner] = useState<"user" | "agent">("agent");
    const desktop = {
        id: "linux-vm:preview",
        name: "Desktop preview",
        status: endpoint ? "running" : "stopped",
        ready: Boolean(endpoint),
        viewerUrl: endpoint,
        problem: endpoint ? undefined : "Supply a viewer URL to connect a disposable test desktop.",
        controlOwner: owner,
    } as LinuxDesktop;
    return (
        <div style={{ position: "fixed", inset: "48px 24px 24px", background: "#111514" }}>
            <ManagedVncScreen desktop={desktop} onTakeControl={async () => setOwner("user")} />
        </div>
    );
}
