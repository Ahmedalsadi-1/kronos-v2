// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const RequiredHermesBackendContract = 6

export function backendContractIsOutdated(contract: number | undefined, backend?: 'hermes' | 'kronoscode'): boolean {
  // ACP compatibility is validated by Electron before starting a KronosCode session.
  return backend !== 'kronoscode' && (contract ?? 0) < RequiredHermesBackendContract
}
