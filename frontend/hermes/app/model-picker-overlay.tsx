import { useStore } from '@nanostores/react'

import type { ModelSelection } from '@hermes/app/shell/model-menu-panel'
import { ModelPickerDialog } from '@hermes/components/model-picker'
import type { HermesGateway } from '@hermes/hermes'
import { useStoreSelector } from '@hermes/lib/use-session-slice'
import {
  $activeSessionId,
  $currentModel,
  $currentProvider,
  $gatewayState,
  $modelPickerOpen,
  setModelPickerOpen
} from '@hermes/store/session'
import { $focusedRuntimeId, $sessionStates } from '@hermes/store/session-states'

interface ModelPickerOverlayProps {
  gateway?: HermesGateway
  contentClassName?: string
  targetSessionId?: string | null
  onClose?: () => void
  onSelect: (selection: ModelSelection) => void
  profile: string
}

export function ModelPickerOverlay({ gateway, onSelect, profile, contentClassName, targetSessionId, onClose }: ModelPickerOverlayProps) {
  const primarySessionId = useStore($activeSessionId)
  const primaryModel = useStore($currentModel)
  const primaryProvider = useStore($currentProvider)
  const focusedRuntimeId = useStore($focusedRuntimeId)
  // `$focusedSessionState` is a projection of `$sessionStates`, republished on
  // EVERY message delta — and this overlay is mounted app-wide. Only two
  // fields are read off it, so subscribing to the whole object re-rendered
  // this component (and the un-memoized closed dialog below) per token while
  // the focused session streamed. Select each scalar so an unchanged
  // model/provider bails out instead — same fix as the statusbar (#72163).
  const sessionId = targetSessionId !== undefined ? targetSessionId : focusedRuntimeId ?? primarySessionId
  const model = useStoreSelector($sessionStates, states => (sessionId ? states[sessionId]?.model : null) ?? null)
  const provider = useStoreSelector($sessionStates, states => (sessionId ? states[sessionId]?.provider : null) ?? null)
  const gatewayOpen = useStore($gatewayState) === 'open'
  const open = useStore($modelPickerOpen)

  // Prefer the focused tile's runtime when the overlay opens from a tile that
  // lacked a live menu (gateway closed → fallback path).
  const currentModel = (sessionId !== primarySessionId && model) || primaryModel
  const currentProvider = (sessionId !== primarySessionId && provider) || primaryProvider

  if (!gatewayOpen) {
    return null
  }

  return (
    <ModelPickerDialog
      contentClassName={contentClassName}
      currentModel={currentModel}
      currentProvider={currentProvider}
      gw={gateway}
      onOpenChange={open => {
        setModelPickerOpen(open)
        if (!open) onClose?.()
      }}
      onSelect={selection => onSelect({ ...selection, sessionId })}
      open={open}
      profile={profile}
      sessionId={sessionId}
    />
  )
}
