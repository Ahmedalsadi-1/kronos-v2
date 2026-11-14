// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export class SwarmWorkerError extends Error {
    settledCancellation = false;
    constructor(
        message: string,
        readonly dispatched: boolean,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = "SwarmWorkerError";
    }
}
