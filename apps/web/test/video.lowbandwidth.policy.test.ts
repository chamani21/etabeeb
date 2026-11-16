/**
 * Low-bandwidth calls — pure units: LiveKit room options and the AUTO network
 * policy (debounce, hysteresis, anti-oscillation, reconnect behaviour).
 * No LiveKit server, no browser.
 */
import { describe, it, expect } from 'vitest'
import { AudioPresets, Room } from 'livekit-client'
import { buildRoomOptions, CAMERA_CAPTURE, ConsultationReconnectPolicy, LOW_VIDEO_LAYER, MIC_CAPTURE, PUBLISH_DEFAULTS, RECONNECT_BUDGET_MS, TOP_VIDEO_ENCODING } from '@/components/video/callConfig'
import { classify, DEFAULT_POLICY, NetworkPolicy, startTierFromHint, type LinkQuality } from '@/components/video/networkPolicy'

describe('LiveKit room options (voice-first, no HD)', () => {
  it('captures ≈360p@15fps and publishes one 360p + one 180p simulcast layer', () => {
    expect(CAMERA_CAPTURE.resolution).toEqual({ width: 640, height: 360, frameRate: 15 })
    expect(TOP_VIDEO_ENCODING).toEqual({ maxBitrate: 300_000, maxFramerate: 15 })
    expect(PUBLISH_DEFAULTS.simulcast).toBe(true)
    expect(PUBLISH_DEFAULTS.videoSimulcastLayers).toHaveLength(1)
    expect(LOW_VIDEO_LAYER.width).toBe(320)
    expect(LOW_VIDEO_LAYER.height).toBe(180)
    expect(LOW_VIDEO_LAYER.encoding).toMatchObject({ maxBitrate: 80_000, maxFramerate: 10 })
    expect(PUBLISH_DEFAULTS.videoCodec).toBe('vp8')
  })

  it('speech audio: 24 kbps Opus, DTX + RED, mono, echo cancellation / noise suppression / AGC', () => {
    expect(PUBLISH_DEFAULTS.audioPreset).toEqual(AudioPresets.speech)
    expect(PUBLISH_DEFAULTS.audioPreset!.maxBitrate).toBe(24_000)
    expect(PUBLISH_DEFAULTS).toMatchObject({ dtx: true, red: true, forceStereo: false, stopMicTrackOnMute: false })
    expect(MIC_CAPTURE).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 })
  })

  it('enables adaptiveStream (pixel density 1, pause in background) and dynacast', () => {
    const o = buildRoomOptions()
    expect(o.adaptiveStream).toEqual({ pixelDensity: 1, pauseVideoInBackground: true })
    expect(o.dynacast).toBe(true)
    expect(o.reconnectPolicy).toBeInstanceOf(ConsultationReconnectPolicy)
  })

  it('the SDK accepts the options and merges them over its defaults', () => {
    const room = new Room(buildRoomOptions())
    expect(room.options.publishDefaults).toMatchObject({ dtx: true, red: true, videoCodec: 'vp8', simulcast: true, videoEncoding: TOP_VIDEO_ENCODING })
    expect(room.options.audioCaptureDefaults).toMatchObject(MIC_CAPTURE)
    expect(room.options.videoCaptureDefaults).toMatchObject({ resolution: CAMERA_CAPTURE.resolution })
    expect(room.options.dynacast).toBe(true)
  })

  it('reconnect policy keeps trying with capped back-off for 2 minutes, then gives up', () => {
    const p = new ConsultationReconnectPolicy(RECONNECT_BUDGET_MS, () => 0)
    expect(p.nextRetryDelayInMs({ retryCount: 0, elapsedMs: 0 })).toBe(0)
    expect(p.nextRetryDelayInMs({ retryCount: 3, elapsedMs: 5_000 })).toBe(2_700)
    expect(p.nextRetryDelayInMs({ retryCount: 12, elapsedMs: 60_000 })).toBe(7_000)
    expect(p.nextRetryDelayInMs({ retryCount: 30, elapsedMs: 119_000 })).toBe(7_000)
    expect(p.nextRetryDelayInMs({ retryCount: 31, elapsedMs: RECONNECT_BUDGET_MS })).toBeNull()
    // the SDK default would already have stopped after 10 attempts (~45 s)
    expect(p.nextRetryDelayInMs({ retryCount: 10, elapsedMs: 45_000 })).not.toBeNull()
  })
})

describe('network classification', () => {
  it('maps LiveKit quality and measured audio loss to levels', () => {
    expect(classify({ quality: 'excellent' })).toBe('good')
    expect(classify({ quality: 'good', audioLoss: 0.01 })).toBe('good')
    expect(classify({ quality: 'good', audioLoss: 0.06 })).toBe('weak')
    expect(classify({ quality: 'good', audioLoss: 0.2 })).toBe('very_weak')
    expect(classify({ quality: 'poor' })).toBe('weak')
    expect(classify({ quality: 'poor', audioLoss: 0.15 })).toBe('very_weak')
    expect(classify({ quality: 'lost' })).toBe('very_weak')
    expect(classify({ quality: 'unknown' })).toBeNull()
  })

  it('pre-join hint: 2g / slow-2g starts audio first, otherwise low video; no API (Safari) = low', () => {
    expect(startTierFromHint({ effectiveType: 'slow-2g' })).toBe('paused')
    expect(startTierFromHint({ effectiveType: '2g' })).toBe('paused')
    expect(startTierFromHint({ effectiveType: '3g' })).toBe('low')
    expect(startTierFromHint({ effectiveType: '4g' })).toBe('low')
    expect(startTierFromHint(undefined)).toBe('low')
  })
})

describe('AUTO policy: debounce + hysteresis', () => {
  /** Feed one sample every 2 s for `seconds`; returns the tier changes. */
  function feed(p: NetworkPolicy, clock: { t: number }, quality: LinkQuality, seconds: number, audioLoss?: number) {
    const changes = []
    for (let i = 0; i < seconds / 2; i++) {
      clock.t += 2_000
      const c = p.update({ quality, audioLoss }, clock.t)
      if (c) changes.push(c)
    }
    return changes
  }

  it('starts at the low tier and only reaches standard after sustained good quality', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('low', 0)
    expect(feed(p, clock, 'good', 18)).toEqual([])
    expect(p.tier).toBe('low')
    expect(feed(p, clock, 'excellent', 6).map((c) => c.to)).toEqual(['standard'])
  })

  it('a momentary packet-loss spike or one bad sample changes nothing', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('standard', 0)
    feed(p, clock, 'good', 10)
    expect(feed(p, clock, 'lost', 4)).toEqual([]) // 4 s of "lost" < 6 s severe window
    expect(feed(p, clock, 'good', 2, 0.3)).toEqual([]) // a single lossy sample
    expect(feed(p, clock, 'poor', 6)).toEqual([]) // 6 s weak < 8 s degrade window
    expect(p.tier).toBe('standard')
  })

  it('sustained weak lowers quality first and never pauses video on its own', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('standard', 0)
    const changes = feed(p, clock, 'poor', 120)
    expect(changes).toEqual([{ from: 'standard', to: 'low', reason: 'degraded' }])
    expect(p.tier).toBe('low')
  })

  it('sustained very weak steps down one tier at a time: standard → low → paused', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('standard', 0)
    const changes = feed(p, clock, 'lost', 20)
    expect(changes.map((c) => c.to)).toEqual(['low', 'paused'])
    expect(changes[0]!.reason).toBe('degraded')
  })

  it('heavy measured audio loss counts as very weak even when the server score is good', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('low', 0)
    expect(feed(p, clock, 'good', 8, 0.2).map((c) => c.to)).toEqual(['paused'])
  })

  it('resuming from paused needs a longer stable period, then goes to low, then standard', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('paused', 0)
    expect(feed(p, clock, 'good', 28)).toEqual([])
    expect(feed(p, clock, 'good', 4).map((c) => c.to)).toEqual(['low'])
    expect(feed(p, clock, 'good', 18)).toEqual([])
    expect(feed(p, clock, 'good', 4).map((c) => c.to)).toEqual(['standard'])
  })

  it('anti-oscillation: a downgrade shortly after an upgrade doubles the recovery hold', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('low', 0)
    // a streak starts at its first sample, hence + one sample
    expect(feed(p, clock, 'good', DEFAULT_POLICY.recoverAfterMs / 1000 + 2).map((c) => c.to)).toEqual(['standard'])
    expect(feed(p, clock, 'poor', 10).map((c) => c.to)).toEqual(['low']) // flapped within 60 s
    // the normal 20 s is no longer enough …
    expect(feed(p, clock, 'good', 24)).toEqual([])
    // … 40 s is
    expect(feed(p, clock, 'good', 18).map((c) => c.to)).toEqual(['standard'])
  })

  it('unknown quality breaks a streak and never acts', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('standard', 0)
    feed(p, clock, 'lost', 4)
    feed(p, clock, 'unknown', 10)
    expect(feed(p, clock, 'lost', 4)).toEqual([])
    expect(p.tier).toBe('standard')
  })

  it('reconnecting freezes the policy; afterwards video resumes at most at the low tier', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('standard', 0)
    p.onReconnecting()
    expect(feed(p, clock, 'lost', 60)).toEqual([])
    expect(p.tier).toBe('standard')
    expect(p.onReconnected(clock.t)).toEqual({ from: 'standard', to: 'low', reason: 'reconnected' })
    // a paused call stays paused after reconnecting
    const q = new NetworkPolicy('paused', 0)
    q.onReconnecting()
    expect(q.onReconnected(10)).toBeNull()
    expect(q.tier).toBe('paused')
  })

  it('the displayed level only changes after it has persisted for 3 s', () => {
    const clock = { t: 0 }
    const p = new NetworkPolicy('low', 0)
    feed(p, clock, 'good', 6)
    expect(p.displayLevel).toBe('good')
    feed(p, clock, 'poor', 4) // first poor sample at +2 s, still only 2 s old
    expect(p.displayLevel).toBe('good')
    feed(p, clock, 'poor', 2)
    expect(p.displayLevel).toBe('weak')
  })

  it('leaving Audio Only always restarts video at the low tier', () => {
    expect(new NetworkPolicy('standard', 0).resumeAtLow(5)).toMatchObject({ to: 'low', reason: 'manual' })
    expect(new NetworkPolicy('paused', 0).resumeAtLow(5)).toMatchObject({ to: 'low', reason: 'manual' })
    expect(new NetworkPolicy('low', 0).resumeAtLow(5)).toBeNull()
  })
})
