import { atom } from 'nanostores'

import { persistStringRecord, storedStringRecord } from '@hermes/lib/storage'

const KEY = 'hermes.desktop.interfaceAppearance'

export type InterfaceFont = 'default' | 'system' | 'inter' | 'mono'
export type ButtonStyle = 'default' | 'flat' | 'outlined'

interface InterfaceAppearance {
  font: InterfaceFont
  buttonStyle: ButtonStyle
}

function readAppearance(): InterfaceAppearance {
  const { font, buttonStyle } = storedStringRecord(KEY)

  return {
    font: font === 'system' || font === 'inter' || font === 'mono' ? font : 'default',
    buttonStyle: buttonStyle === 'flat' || buttonStyle === 'outlined' ? buttonStyle : 'default'
  }
}

export const $interfaceAppearance = atom(readAppearance())

export function setInterfaceAppearance(update: Partial<InterfaceAppearance>) {
  const next = { ...$interfaceAppearance.get(), ...update }
  persistStringRecord(KEY, { ...readAppearance(), ...update })
  $interfaceAppearance.set(next)
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  $interfaceAppearance.subscribe(({ font, buttonStyle }) => {
    document.documentElement.dataset.kronInterfaceFont = font
    document.documentElement.dataset.kronButtonStyle = buttonStyle
  })

  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) $interfaceAppearance.set(readAppearance())
  })
}
