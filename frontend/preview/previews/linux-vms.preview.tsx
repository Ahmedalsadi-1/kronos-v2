// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemUIProvider } from "@/app/components/system-ui";
import { LinuxVmsPanel, type MachineSection } from "@/app/view/linux-vms/linux-vms";

export function LinuxVmsPreview() {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("device");
    const section: MachineSection = kind == "macos" || kind == "android" || kind == "iphone" ? kind : "desktop";
    return (
        <SystemUIProvider>
            <div
                className="kt-system-ui"
                data-color-scheme={params.get("theme") || "light"}
                style={{ position: "absolute", top: 48, insetInline: 0, bottom: 0 }}
            >
                <LinuxVmsPanel initialSection={section} settings={params.get("settings") == "true"} />
            </div>
        </SystemUIProvider>
    );
}
