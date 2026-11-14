// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { expect, it, vi } from 'vitest'

import { sessionRoute } from '@hermes/app/routes'
import { HermesShellModeProvider } from '@hermes/lib/kronterm-host'
import {
  $krontermInspectorCompact,
  $krontermInspectorOpen,
  $krontermInspectorSection,
  $krontermInspectorTarget,
  KrontermInspectorChatEvent
} from '@hermes/lib/kronterm-sidebar'

import { SessionActionsMenu } from './session-actions-menu'

function CurrentRoute() {
  const { pathname } = useLocation()
  return <output>{pathname}</output>
}

it('opens the chosen session in the inspector and skips unsupported embedded windows', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const dock = vi.fn()
  window.addEventListener(KrontermInspectorChatEvent, dock)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('hermesDesktop', {
    krontermSurfaces: {},
    openSessionWindow: vi.fn(),
    openSessionInTerminal: vi.fn()
  })

  try {
    await act(async () => {
      $krontermInspectorTarget.set(host)
      $krontermInspectorCompact.set(true)
      root.render(
        <MemoryRouter initialEntries={[sessionRoute('previous-session')]}>
          <HermesShellModeProvider hudMode>
            <CurrentRoute />
            <SessionActionsMenu sessionId="other-session" title="Other session">
              <button type="button">Session actions</button>
            </SessionActionsMenu>
          </HermesShellModeProvider>
        </MemoryRouter>
      )
    })

    await act(async () =>
      host.querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    )
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const labels = items.map(item => item.textContent)
    expect(labels).not.toContain('New window')
    expect(labels).not.toContain('Open in terminal')
    const sidePanel = items.find(item => item.textContent === 'Open in side panel')
    expect(sidePanel).toBeTruthy()

    await act(async () => sidePanel?.click())
    expect(host.querySelector('output')?.textContent).toBe(sessionRoute('other-session'))
    expect($krontermInspectorOpen.get()).toBe(true)
    expect($krontermInspectorCompact.get()).toBe(false)
    expect($krontermInspectorSection.get()).toBe('chat')
    expect(dock).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    $krontermInspectorOpen.set(false)
    $krontermInspectorSection.set('files')
    $krontermInspectorTarget.set(null)
    window.removeEventListener(KrontermInspectorChatEvent, dock)
    host.remove()
    vi.unstubAllGlobals()
  }
})
