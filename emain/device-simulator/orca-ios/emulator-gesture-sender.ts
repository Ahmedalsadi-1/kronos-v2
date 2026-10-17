import WebSocket from 'ws'
import {
  encodeServeSimTouchFrame,
  type ServeSimTouchFrame
} from './emulator-touch-frame'

export type EmulatorGesturePoint = ServeSimTouchFrame

export async function sendEmulatorGestureSequence(
  wsUrl: string,
  points: EmulatorGesturePoint[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let index = 0
    let timer: NodeJS.Timeout | null = null
    const deadline = setTimeout(() => { cleanup(); ws.terminate(); reject(new Error("Simulator gesture timed out")) }, 15_000)
    const cleanup = (): void => {
      clearTimeout(deadline)
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    const sendNext = (): void => {
      if (index >= points.length) {
        cleanup()
        timer = setTimeout(() => {
          ws.close()
          resolve()
        }, 50)
        return
      }
      const point = points[index++]
      ws.send(Buffer.from(encodeServeSimTouchFrame(point)))
      timer = setTimeout(sendNext, 16)
    }
    ws.on('open', sendNext)
    ws.on('error', (error) => {
      cleanup()
      reject(error)
    })
    ws.on('close', () => {
      cleanup()
      if (index < points.length) {
        reject(new Error('Emulator gesture stream closed before all points were sent'))
      }
    })
  })
}
