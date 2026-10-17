// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { backendContractIsOutdated } from './backend-contract'

describe('session backend compatibility', () => {
  it('does not apply the Hermes desktop contract to ACP sessions', () => {
    expect(backendContractIsOutdated(undefined, 'kronoscode')).toBe(false)
    expect(backendContractIsOutdated(0, 'kronoscode')).toBe(false)
  })
  it('keeps warnings for outdated or missing Hermes contracts', () => {
    expect(backendContractIsOutdated(undefined)).toBe(true)
    expect(backendContractIsOutdated(5, 'hermes')).toBe(true)
    expect(backendContractIsOutdated(6, 'hermes')).toBe(false)
    expect(backendContractIsOutdated(7)).toBe(false)
  })
})
