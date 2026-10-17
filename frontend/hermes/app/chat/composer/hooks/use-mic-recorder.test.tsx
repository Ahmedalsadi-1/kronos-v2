// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMicRecorder } from './use-mic-recorder'

let recorder: any
let hook: ReturnType<typeof useMicRecorder>
let root: Root
const track = { stop: vi.fn(), onended: null as (() => void) | null }
const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
const getUserMedia = vi.fn()
const Copy = {
  microphoneAccessDenied: 'Denied',
  microphoneConstraintsUnsupported: 'Constraints',
  microphoneInUse: 'In use',
  microphonePermissionDenied: 'Permission',
  microphoneStartFailed: 'Failed',
  microphoneUnsupported: 'Unsupported',
  noMicrophone: 'Microphone disconnected',
}

class Recorder {
  static isTypeSupported = () => true
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: any
  onstop: any
  onerror: any
  constructor() {
    recorder = this
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['audio']) })
      this.onstop?.()
    })
  }
}

function Probe() {
  hook = useMicRecorder(Copy)
  return null
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  getUserMedia.mockReset().mockResolvedValue(stream)
  track.stop.mockClear()
  track.onended = null
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

describe('microphone lifecycle', () => {
  it('releases permission-delayed capture after cancellation and avoids duplicate requests', async () => {
    let resolve: (value: any) => void
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    await act(async () => {
      const pending = hook.handle.start()
      await Promise.resolve()
      await hook.handle.start()
      hook.handle.cancel()
      resolve(stream)
      await pending
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(hook.recording).toBe(false)
  })
  it('starts a retry while a cancelled device request is still pending', async () => {
    let resolve: (value: any) => void
    const lateStop = vi.fn()
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    await act(async () => {
      const pending = hook.handle.start()
      await Promise.resolve()
      hook.handle.cancel()
      await hook.handle.start()
      resolve({ getTracks: () => [{ stop: lateStop }] })
      await pending
    })
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(lateStop).toHaveBeenCalledOnce()
    expect(hook.recording).toBe(true)
  })
  it('settles concurrent stop requests with the same recording', async () => {
    await act(async () => hook.handle.start())
    await act(async () => {
      const first = hook.handle.stop()
      const second = hook.handle.stop()
      expect(first).toBe(second)
      expect((await first)?.audio.size).toBeGreaterThan(0)
    })
    expect(hook.recording).toBe(false)
  })
  it('reports a disconnected microphone and allows another capture', async () => {
    const onError = vi.fn()
    await act(async () => hook.handle.start({ onError }))
    await act(async () => track.onended?.())
    expect(onError).toHaveBeenCalledWith(new Error('Microphone disconnected'))
    expect(hook.recording).toBe(false)
    await act(async () => hook.handle.start())
    expect(hook.recording).toBe(true)
    expect(recorder.state).toBe('recording')
  })
})
