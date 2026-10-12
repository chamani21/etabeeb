/**
 * VoiceCapture (the recording session behind VoiceRecorder) with fake browser
 * APIs: Chrome/Android (WebM/Opus) and iPhone Safari (MP4/AAC) recorders,
 * double taps, and microphone/recorder cleanup.
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VoiceCapture, pickMimeType, type VoiceCaptureEnv } from '@/components/staff/rx/voice-capture'
import { VoiceRecorder } from '@/components/staff/rx/VoiceRecorder'

class FakeTrack {
  stopped = false
  stop() {
    this.stopped = true
  }
}
class FakeStream {
  tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
}

function browser(kind: 'chrome' | 'safari') {
  const supported = kind === 'chrome' ? ['audio/webm;codecs=opus', 'audio/webm'] : ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4']
  const recorders: FakeRecorder[] = []
  class FakeRecorder {
    static isTypeSupported = (t: string) => supported.includes(t)
    state: 'inactive' | 'recording' | 'paused' = 'inactive'
    mimeType: string
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(
      public stream: FakeStream,
      opts?: { mimeType?: string },
    ) {
      this.mimeType = opts?.mimeType ?? supported[0]!
      recorders.push(this)
    }
    start() {
      this.state = 'recording'
    }
    pause() {
      this.state = 'paused'
    }
    resume() {
      this.state = 'recording'
    }
    /** one MediaRecorder timeslice */
    chunk(text: string) {
      this.ondataavailable?.({ data: new Blob([text]) })
    }
    stop() {
      if (this.state === 'inactive') return
      this.state = 'inactive'
      this.chunk('-final')
      this.onstop?.()
    }
  }
  const streams: FakeStream[] = []
  const pending: { resolve: (s: FakeStream) => void; reject: (e: unknown) => void }[] = []
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve, reject) =>
        pending.push({
          resolve: (s) => {
            streams.push(s)
            resolve(s as unknown as MediaStream)
          },
          reject,
        }),
      ),
  )
  const env = { getUserMedia, MediaRecorder: FakeRecorder as unknown as VoiceCaptureEnv['MediaRecorder'] }
  /** the user answers the microphone permission prompt */
  const grant = async () => {
    pending.shift()!.resolve(new FakeStream())
    await Promise.resolve()
    await Promise.resolve()
  }
  const deny = async (name = 'NotAllowedError') => {
    pending.shift()!.reject(Object.assign(new Error('denied'), { name }))
    await Promise.resolve()
    await Promise.resolve()
  }
  return { env, recorders, streams, getUserMedia, grant, deny }
}

function handlers() {
  return { onRecording: vi.fn(), onRecorded: vi.fn<(b: Blob) => void>(), onFailed: vi.fn() }
}

describe('VoiceCapture', () => {
  it('Chrome/Android records WebM/Opus; iPhone Safari records MP4/AAC', async () => {
    for (const [kind, type] of [
      ['chrome', 'audio/webm;codecs=opus'],
      ['safari', 'audio/mp4;codecs=mp4a.40.2'],
    ] as const) {
      const b = browser(kind)
      expect(pickMimeType(b.env.MediaRecorder)).toBe(type)
      const h = handlers()
      const c = new VoiceCapture(b.env, h)
      const started = c.start()
      await b.grant()
      expect(await started).toBe('started')
      b.recorders[0]!.chunk('a')
      c.stop()
      const blob = h.onRecorded.mock.calls[0]![0]
      expect(blob.type).toBe(type)
      expect(await blob.text()).toBe('a-final')
      expect(b.streams[0]!.tracks[0]!.stopped).toBe(true)
    }
  })

  it('a double tap while the permission prompt is open starts ONE recording', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const first = c.start()
    expect(c.busy).toBe(true)
    expect(await c.start()).toBe('busy') // second tap
    await b.grant()
    expect(await first).toBe('started')
    expect(b.getUserMedia).toHaveBeenCalledTimes(1)
    expect(b.recorders).toHaveLength(1)
    expect(await c.start()).toBe('busy') // tap while recording
    expect(b.recorders).toHaveLength(1)
  })

  it('each recording contains only its own chunks (no mixing of two recorders)', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s1 = c.start()
    await b.grant()
    await s1
    const r1 = b.recorders[0]!
    r1.chunk('A1')
    c.stop()
    const s2 = c.start() // "Record again"
    await b.grant()
    await s2
    const r2 = b.recorders[1]!
    r2.chunk('B1')
    r1.chunk('LATE-A') // a stray late event from the first recorder is ignored
    c.stop()
    expect(await h.onRecorded.mock.calls[0]![0].text()).toBe('A1-final')
    expect(await h.onRecorded.mock.calls[1]![0].text()).toBe('B1-final')
    expect(b.streams.every((s) => s.tracks[0]!.stopped)).toBe(true)
  })

  it('pause/resume keep one recording', async () => {
    const b = browser('safari')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s = c.start()
    await b.grant()
    await s
    b.recorders[0]!.chunk('x')
    expect(c.pause()).toBe(true)
    expect(c.resume()).toBe(true)
    b.recorders[0]!.chunk('y')
    c.stop()
    expect(await h.onRecorded.mock.calls[0]![0].text()).toBe('xy-final')
  })

  it('leaving the page while the permission prompt is open releases the microphone when it arrives', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s = c.start()
    c.dispose()
    await b.grant()
    expect(await s).toBe('cancelled')
    expect(b.streams[0]!.tracks[0]!.stopped).toBe(true)
    expect(b.recorders).toHaveLength(0)
    expect(h.onRecording).not.toHaveBeenCalled()
  })

  it('leaving the page while recording stops the recorder and the microphone, without uploading', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s = c.start()
    await b.grant()
    await s
    c.dispose()
    expect(b.recorders[0]!.state).toBe('inactive')
    expect(b.streams[0]!.tracks[0]!.stopped).toBe(true)
    expect(h.onRecorded).not.toHaveBeenCalled()
    expect(c.busy).toBe(false)
  })

  it('denied permission / missing microphone are reported and a retry is possible', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    let s = c.start()
    await b.deny('NotAllowedError')
    expect(await s).toBe('failed')
    expect(h.onFailed).toHaveBeenLastCalledWith('permission')
    s = c.start()
    await b.deny('NotFoundError')
    expect(h.onFailed).toHaveBeenLastCalledWith('no_microphone')
    expect(c.busy).toBe(false)
  })

  it('a recorder error releases the microphone', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s = c.start()
    await b.grant()
    await s
    b.recorders[0]!.onerror?.()
    expect(h.onFailed).toHaveBeenCalledWith('interrupted')
    expect(b.streams[0]!.tracks[0]!.stopped).toBe(true)
    expect(c.busy).toBe(false)
  })

  it('a recorder that cannot be created releases the microphone', async () => {
    const b = browser('chrome')
    const h = handlers()
    const Broken = class {
      static isTypeSupported = () => true
      constructor() {
        throw new Error('NotSupportedError')
      }
    }
    const c = new VoiceCapture({ ...b.env, MediaRecorder: Broken as unknown as VoiceCaptureEnv['MediaRecorder'] }, h)
    const s = c.start()
    await b.grant()
    expect(await s).toBe('failed')
    expect(h.onFailed).toHaveBeenCalledWith('start_failed')
    expect(b.streams[0]!.tracks[0]!.stopped).toBe(true)
  })

  it('an empty recording is reported, not uploaded', async () => {
    const b = browser('chrome')
    const h = handlers()
    const c = new VoiceCapture(b.env, h)
    const s = c.start()
    await b.grant()
    await s
    const r = b.recorders[0]!
    r.chunk = () => undefined // no data at all
    r.stop()
    expect(h.onFailed).toHaveBeenCalledWith('empty')
    expect(h.onRecorded).not.toHaveBeenCalled()
  })
})

describe('VoiceRecorder render', () => {
  it('without MediaRecorder (server render, old browsers) shows a notice instead of a broken button', () => {
    const html = renderToStaticMarkup(createElement(VoiceRecorder, { onSave: async () => {}, recordLabel: '🎙 Record voice message' }))
    expect(html).toContain('cannot record audio')
  })
})
