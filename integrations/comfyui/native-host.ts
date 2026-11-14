// SPDX-License-Identifier: GPL-3.0-only
import { shallowRef } from 'vue'

export type ComfyLibrary = 'assets' | 'node-library' | 'model-library' | 'workflows' | 'apps' | 'job-history'
export interface ComfyPanels {
  library: ComfyLibrary | null
  properties: boolean
  logs: boolean
}

export interface ComfyHost {
  origin: string
  viewport: HTMLElement
  world: HTMLElement
  libraryTarget: HTMLElement | null
  propertiesTarget: HTMLElement | null
  logsTarget: HTMLElement | null
  overlayTarget: HTMLElement
  panels: ComfyPanels
  camera: { x: number; y: number; zoom: number }
  order: Record<string, number>
  onReady(): void
  onError(error: unknown): void
  onNodes(nodes: Array<{ id: string; title: string; x: number; y: number; width: number; height: number }>): void
  onSelect(id: string): void
  onClosePanel(panel: 'library' | 'properties'): void
  onPickerChange(open: boolean): void
}

export const comfyHost = shallowRef<ComfyHost | null>(null)
