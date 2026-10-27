// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AppStreamView } from "./appstream";
import type { AppStreamViewModel } from "./appstream-model";

export function AppStreamEntry(props: ViewComponentProps<AppStreamViewModel>) {
    return <AppStreamView {...props} />;
}
