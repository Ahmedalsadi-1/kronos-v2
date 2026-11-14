const JPEG_START = Buffer.from([0xff, 0xd8])
const JPEG_END = Buffer.from([0xff, 0xd9])
const DEFAULT_MAX_FRAME_BYTES = 2 * 1024 * 1024

export class MjpegFrameParser {
  private partial?: Buffer<ArrayBufferLike>
  private frameBytes = 0
  private trailingFF = false

  constructor(private readonly maxFrameBytes = DEFAULT_MAX_FRAME_BYTES) {}

  reset(): void {
    this.partial = undefined
    this.frameBytes = 0
    this.trailingFF = false
  }

  push(chunk: Buffer<ArrayBufferLike>, onFrame: (frame: Buffer<ArrayBufferLike>) => void): void {
    let offset = 0
    while (offset < chunk.length) {
      if (this.frameBytes === 0) {
        if (this.trailingFF && chunk[offset] === 0xd8) {
          this.reserve(JPEG_START.length)
          this.frameBytes = JPEG_START.length
          offset++
        } else {
          const start = chunk.indexOf(JPEG_START, offset)
          if (start === -1) {
            this.trailingFF = chunk.at(-1) === 0xff
            return
          }
          offset = start + JPEG_START.length
          this.frameBytes = JPEG_START.length
        }
        this.trailingFF = false
      }

      const splitEnd = this.trailingFF && chunk[offset] === 0xd9
      const end = splitEnd ? offset : chunk.indexOf(JPEG_END, offset)
      const nextOffset = end === -1 ? chunk.length : end + (splitEnd ? 1 : JPEG_END.length)
      const total = this.frameBytes + nextOffset - offset
      if (total > this.maxFrameBytes) {
        // Resume scanning at the size limit, even if a later JPEG supplied the end marker.
        offset += this.maxFrameBytes - this.frameBytes
        this.reset()
        continue
      }

      if (end === -1) {
        const partial = this.reserve(total)
        if (nextOffset > offset) {
          chunk.copy(partial, this.frameBytes, offset, nextOffset)
          this.trailingFF = chunk.at(-1) === 0xff
        }
        this.frameBytes = total
        return
      }

      let frame = chunk.subarray(offset - JPEG_START.length, nextOffset)
      if (this.partial) {
        const partial = this.reserve(total)
        chunk.copy(partial, this.frameBytes, offset, nextOffset)
        frame = partial.subarray(0, total)
      }
      this.reset()
      offset = nextOffset
      onFrame(frame)
    }
  }

  private reserve(size: number): Buffer<ArrayBufferLike> {
    if (this.partial && this.partial.length >= size) return this.partial
    const capacity = Math.min(this.maxFrameBytes, Math.max(size, (this.partial?.length ?? 0) * 2, 4096))
    const next = Buffer.allocUnsafe(capacity)
    if (this.partial) {
      this.partial.copy(next, 0, 0, this.frameBytes)
    } else {
      JPEG_START.copy(next)
    }
    return (this.partial = next)
  }
}
