// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

import { onComposerInsertRefsRequest } from '@hermes/app/chat/composer/focus'

import { MarkdownTextContent } from './markdown-text'

it('routes a markdown link to the browser or back into the composer that owns it', async () => {
  const url = 'https://example.com/docs'
  const openBrowser = vi.fn().mockResolvedValue(undefined)
  const insertRefs = vi.fn()
  const unsubscribe = onComposerInsertRefsRequest(insertRefs)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('hermesDesktop', { openPreviewInBrowser: openBrowser })

  try {
    await act(async () =>
      root.render(
        <div data-composer-target="tile:source">
          <MarkdownTextContent isRunning={false} text={`[Read the docs](${url})`} />
        </div>
      )
    )
    const link = host.querySelector(`a[href="${url}"]`)
    expect(link).toBeTruthy()
    const choose = async (label: string) => {
      await act(async () => link?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })))
      const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        entry => entry.textContent === label
      )
      expect(item).toBeTruthy()
      await act(async () => item?.click())
    }

    await choose('Open in browser')
    expect(openBrowser).toHaveBeenCalledWith(url)
    await choose('Add to chat')
    await vi.waitFor(() =>
      expect(insertRefs).toHaveBeenCalledWith({ refs: [{ kind: 'url', value: url }], target: 'tile:source' })
    )
  } finally {
    await act(async () => root.unmount())
    unsubscribe()
    host.remove()
    vi.unstubAllGlobals()
  }
})
