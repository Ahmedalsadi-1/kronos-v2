// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from "react";

export function usePenChatPresentation() {
    const [fullChat, setFullChat] = useState(true);
    const [widgetsReady, setWidgetsReady] = useState(false);
    const updateWidgetsReady = useCallback((ready: boolean) => {
        setWidgetsReady(ready);
        // A new editor connection opens chat asynchronously; saved widgets must wait for its presentation.
        if (!ready) setFullChat(true);
    }, []);
    return { fullChat, setFullChat, widgetsReady, updateWidgetsReady };
}
