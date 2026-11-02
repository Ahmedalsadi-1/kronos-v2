// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AsyncLocalStorage } from "node:async_hooks";
import { withSandboxComputerScope } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";

const RequestContext = new AsyncLocalStorage<{ context: HermesSurfaceContext }>();

export function withToolRequestContext<T>(context: HermesSurfaceContext, operation: () => T): T {
    return RequestContext.run({ context: context ? structuredClone(context) : null }, operation);
}

export function resolveToolRequestContext(fallback: () => HermesSurfaceContext): HermesSurfaceContext {
    const request = RequestContext.getStore();
    return withSandboxComputerScope(request ? request.context : fallback());
}
