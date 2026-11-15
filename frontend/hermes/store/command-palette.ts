import { atom } from 'nanostores'

import { releaseTypingFocus } from '@hermes/components/ui/keyboard-first'
import { $workspaceCanvasPanels } from '@hermes/lib/kronterm-sidebar'

export const $commandPaletteOpen = atom(false)
export const $commandPalettePage = atom<string | null>(null)

export type WorkflowPickerSource = 'n8n' | 'comfy-nodes' | 'comfy-models' | 'commands'
export type WorkflowPickerTarget = { element: HTMLDivElement; overflow: HTMLElement; query: string; tabId: string }
export const $workflowPickerSource = atom<WorkflowPickerSource | null>(null)
export const $workflowPickerCommandTarget = atom<WorkflowPickerTarget | null>(null)
export const $workflowPickerComfyTarget = atom<WorkflowPickerTarget | null>(null)

export function openCommandPalette(): void {
  if ($workspaceCanvasPanels.get()) {
    $workflowPickerSource.set('commands')
    return
  }
  $commandPaletteOpen.set(true)
}

export function openCommandPalettePopup(): void {
  closeWorkflowPicker()
  $commandPaletteOpen.set(true)
}

export function openCommandPalettePage(page: string): void {
  $commandPalettePage.set(page)
  openCommandPalette()
}

export function closeWorkflowPicker(): void {
  $workflowPickerSource.set(null)
  $commandPalettePage.set(null)
}

export function closeCommandPalette(): void {
  setCommandPaletteOpen(false)
}

export function setCommandPaletteOpen(open: boolean): void {
  if (open) {
    openCommandPalette()
    return
  }
  const wasOpen = $commandPaletteOpen.get()
  $commandPaletteOpen.set(false)
  closeWorkflowPicker()
  if (wasOpen) releaseTypingFocus()
}

export function toggleCommandPalette(): void {
  if ($workspaceCanvasPanels.get()) {
    if ($workflowPickerSource.get()) closeWorkflowPicker()
    else openCommandPalette()
    return
  }
  setCommandPaletteOpen(!$commandPaletteOpen.get())
}
