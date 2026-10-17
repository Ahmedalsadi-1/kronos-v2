import { useEffect, useRef } from 'react'

import { flashPetActivity, setPetActivity, setPetVoiceActivity } from '@hermes/store/pet'
import { setPetScale } from '@hermes/store/pet-gallery'
import {
  setPetOverlayOpenAppHandler,
  setPetOverlayScaleHandler,
  setPetOverlaySubmitHandler
} from '@hermes/store/pet-overlay'
import { $sessions } from '@hermes/store/session'
import { $attentionSessionIds } from '@hermes/store/session-states'
import { $voiceHud } from '@hermes/store/voice-hud'
import { $voicePlayback } from '@hermes/store/voice-playback'
import { $speechMotion } from '@hermes/lib/speech-motion'
import { isAuxiliaryWindow } from '@hermes/store/windows'

import type { GatewayRequester } from '../types'

interface PetBridgeParams {
  requestGateway: GatewayRequester
  resumeSession: (sessionId: string) => Promise<unknown> | unknown
  submitText: (text: string) => Promise<unknown> | unknown
}

/**
 * Wires the popped-out pet overlay back into the app: submit a prompt, resize,
 * and open the most-recent thread, plus mirroring "a session is awaiting the
 * user" into the pet's pose. Handlers register ONCE through refs tracking the
 * latest callbacks — re-registering on identity churn leaves a nulled-handler
 * window that can drop a submit. Primary window only.
 */
export function usePetBridge({ requestGateway, resumeSession, submitText }: PetBridgeParams): void {
  const submitTextRef = useRef(submitText)
  submitTextRef.current = submitText
  const resumeSessionRef = useRef(resumeSession)
  resumeSessionRef.current = resumeSession
  const requestGatewayRef = useRef(requestGateway)
  requestGatewayRef.current = requestGateway

  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    setPetOverlaySubmitHandler((text) => void submitTextRef.current(text))
    // Alt+wheel resize from the popped-out pet — persist through this window's
    // gateway (the overlay has none) so it survives restart.
    setPetOverlayScaleHandler((scale) => setPetScale(requestGatewayRef.current, scale))
    // Mail icon: $sessions is most-recent-first; the pet is global, so "most
    // recent" is the right target.
    setPetOverlayOpenAppHandler(() => {
      const recent = $sessions.get()[0]

      if (recent?.id) {
        void resumeSessionRef.current(recent.id)
      }
    })

    return () => {
      setPetOverlaySubmitHandler(null)
      setPetOverlayOpenAppHandler(null)
      setPetOverlayScaleHandler(null)
    }
  }, [])

  useEffect(() => {
    if (isAuxiliaryWindow()) return
    const api = (window as unknown as { api?: ElectronApi }).api
    let hadError = false
    const syncVoice = () => {
      const hud = $voiceHud.get()
      const hasError = hud.active && hud.status === 'error'
      if (hasError && !hadError) flashPetActivity({ error: true })
      hadError = hasError
      const playback = $voicePlayback.get()
      const speaking = playback.status === 'speaking' || (hud.active && hud.status === 'speaking')
      const motion = $speechMotion.get()
      setPetVoiceActivity({
        listening: hud.active && hud.status === 'listening' && !hud.muted,
        speaking,
        voiceLevel: speaking && motion.available ? motion.level : hud.active ? hud.level : 0
      }, speaking || playback.status === 'preparing')
      api?.updateDesktopPetVoice?.({
        active: hud.active || speaking,
        status: speaking ? 'speaking' : hud.status,
        level: speaking && motion.available ? motion.level : hud.active ? hud.level : 0
      })
    }
    const stopHud = $voiceHud.subscribe(syncVoice)
    const stopPlayback = $voicePlayback.subscribe(syncVoice)
    const stopMotion = $speechMotion.subscribe(syncVoice)
    return () => {
      stopHud()
      stopPlayback()
      stopMotion()
      setPetVoiceActivity({ listening: false, speaking: false, voiceLevel: 0 })
      api?.updateDesktopPetVoice?.({ active: false, status: 'idle', level: 0 })
    }
  }, [])

  // Mirror "a session is blocked on the user" (clarify/approval) into the pet's
  // awaitingInput flag so it shows the `waiting` pose.
  useEffect(() => {
    const sync = () => setPetActivity({ awaitingInput: $attentionSessionIds.get().length > 0 })

    sync()

    return $attentionSessionIds.listen(sync)
  }, [])
}
