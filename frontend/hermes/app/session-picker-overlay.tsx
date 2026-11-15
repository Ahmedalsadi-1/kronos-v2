import { useStore } from '@nanostores/react'

import { SessionPickerDialog } from '@hermes/components/session-picker'
import { $gatewayState, $selectedStoredSessionId, $sessionPickerOpen, setSessionPickerOpen } from '@hermes/store/session'

interface SessionPickerOverlayProps {
  contentClassName?: string
  onClose?: () => void
  onResume: (storedSessionId: string) => void | Promise<void>
}

/**
 * Mounts the session picker that `/resume` (and `/sessions`, `/switch`) opens —
 * the desktop equivalent of the TUI's sessions overlay. Resuming runs through
 * the same `resumeSession` path the sidebar uses.
 */
export function SessionPickerOverlay({ onResume, contentClassName, onClose }: SessionPickerOverlayProps) {
  const open = useStore($sessionPickerOpen)
  const gatewayOpen = useStore($gatewayState) === 'open'
  const activeStoredSessionId = useStore($selectedStoredSessionId)

  if (!gatewayOpen) {
    return null
  }

  return (
    <SessionPickerDialog
      contentClassName={contentClassName}
      activeStoredSessionId={activeStoredSessionId}
      onOpenChange={open => {
        setSessionPickerOpen(open)
        if (!open) onClose?.()
      }}
      onResume={onResume}
      open={open}
    />
  )
}
