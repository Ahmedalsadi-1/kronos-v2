// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { atoms } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { BrowserSettings } from "@hermes/app/settings/browser-settings";
import { useAtomValue } from "jotai";

export function KronSettingsBrowserContent({ onOpenSessions }: { onOpenSessions?: () => void } = {}) {
    const config = useAtomValue(atoms.fullConfigAtom);
    if (!config)
        return (
            <p role="status" className="p-8 text-sm">
                Loading browser preferences...
            </p>
        );
    return (
        <BrowserSettings
            onOpenSessions={onOpenSessions}
            initial={{
                "web:defaulturl": config.settings?.["web:defaulturl"] ?? "about:blank",
                "web:defaultsearch":
                    config.settings?.["web:defaultsearch"] ?? "https://www.google.com/search?q={query}",
                "web:openlinksinternally": config.settings?.["web:openlinksinternally"] ?? false,
            }}
            save={async (value) => {
                await RpcApi.SetConfigCommand(TabRpcClient, value);
            }}
        />
    );
}
