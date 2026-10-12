/**
 * Microphone recording session behind VoiceRecorder (no React, so it can be
 * tested with fake browser APIs).
 *
 * Guarantees:
 *  - one recording at a time: a second start() while the microphone is being
 *    opened (double tap) or while recording is ignored;
 *  - each recording collects only its own chunks (two MediaRecorders can never
 *    write into one upload);
 *  - every microphone stream that was opened is stopped (stop, error, dispose,
 *    or a start() that finished after dispose).
 */

/** Best container the browser can record: WebM/Opus (Chrome, Android, Firefox) or MP4/AAC (iPhone Safari). */
export const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'] as const

type RecorderCtor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder
  isTypeSupported?: (type: string) => boolean
}

export function pickMimeType(Recorder: RecorderCtor | undefined): string | undefined {
  if (!Recorder) return undefined
  for (const t of RECORDER_MIME_TYPES) {
    if (Recorder.isTypeSupported?.(t)) return t
  }
  return undefined
}

export type CaptureFailure = 'permission' | 'no_microphone' | 'start_failed' | 'interrupted' | 'empty'

export interface VoiceCaptureEnv {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  MediaRecorder: RecorderCtor
}

export interface VoiceCaptureHandlers {
  onRecording: () => void
  onRecorded: (blob: Blob) => void
  onFailed: (reason: CaptureFailure) => void
}

export type StartResult = 'started' | 'busy' | 'cancelled' | 'failed'

export class VoiceCapture {
  private phase: 'idle' | 'starting' | 'active' = 'idle'
  /** Bumped by dispose() and by every finished session: late callbacks of an old session are ignored */
  private session = 0
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null

  constructor(
    private readonly env: VoiceCaptureEnv,
    private readonly handlers: VoiceCaptureHandlers,
  ) {}

  /** True while the microphone is opening or a recording is in progress. */
  get busy(): boolean {
    return this.phase !== 'idle'
  }

  async start(): Promise<StartResult> {
    if (this.phase !== 'idle') return 'busy'
    this.phase = 'starting'
    const session = ++this.session
    let stream: MediaStream
    try {
      stream = await this.env.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      if (session !== this.session) return 'cancelled'
      this.phase = 'idle'
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
      this.handlers.onFailed(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_microphone' : 'start_failed')
      return 'failed'
    }
    if (session !== this.session) {
      // disposed while the permission prompt was open
      stopStream(stream)
      return 'cancelled'
    }
    let recorder: MediaRecorder
    try {
      const mimeType = pickMimeType(this.env.MediaRecorder)
      recorder = new this.env.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = [] // this recording only
      recorder.ondataavailable = (e) => {
        if (session === this.session && e.data && e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => {
        if (session !== this.session) return
        this.finish()
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        if (blob.size === 0) this.handlers.onFailed('empty')
        else this.handlers.onRecorded(blob)
      }
      recorder.onerror = () => {
        if (session !== this.session) return
        this.finish()
        this.handlers.onFailed('interrupted')
      }
      recorder.start(1000)
    } catch {
      stopStream(stream)
      this.phase = 'idle'
      this.handlers.onFailed('start_failed')
      return 'failed'
    }
    this.stream = stream
    this.recorder = recorder
    this.phase = 'active'
    this.handlers.onRecording()
    return 'started'
  }

  pause(): boolean {
    if (this.recorder?.state === 'recording' && typeof this.recorder.pause === 'function') {
      this.recorder.pause()
      return true
    }
    return false
  }

  resume(): boolean {
    if (this.recorder?.state === 'paused') {
      this.recorder.resume()
      return true
    }
    return false
  }

  /** Ends the recording; onRecorded/onFailed follows from the recorder's stop event. */
  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    else if (this.phase === 'active') this.finish()
  }

  /** Abandon everything (unmount): no further callbacks, microphone released. */
  dispose(): void {
    this.session++
    const r = this.recorder
    if (r && r.state !== 'inactive') {
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    this.finish()
  }

  private finish(): void {
    stopStream(this.stream)
    this.stream = null
    this.recorder = null
    this.phase = 'idle'
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}
