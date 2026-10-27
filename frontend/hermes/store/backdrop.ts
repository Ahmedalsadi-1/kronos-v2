import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@hermes/lib/storage'

const KEY = 'hermes.desktop.backdrop.v1'

/** Persist the user's chat-background preference across presentations. */
export const $backdrop = atom(storedBoolean(KEY, true))

$backdrop.subscribe(on => persistBoolean(KEY, on))

export function setBackdrop(on: boolean) {
  $backdrop.set(on)
}
