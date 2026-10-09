/**
 * Low-bandwidth calls — CallController against a fake LiveKit room:
 * manual Audio Only, video resumption, remote video unsubscribe/resubscribe,
 * AUTO fallback/recovery, microphone retention, reconnect, device failures.
 * Real livekit-client enums/events; no LiveKit server, no browser media.
 */
import { EventEmitter } from 'events'
import { describe, it, expect, vi } from 'vitest'
import { ConnectionState, RoomEvent, Track, VideoQuality } from 'livekit-client'
import { CallController, type CallControllerOptions } from '@/components/video/callController'

class FakePub {
  subscribed = true
  enabled = true
  quality: VideoQuality | undefined
  history: string[] = []
  track: { getReceiverStats: () => Promise<{ packetsLost: number; packetsReceived: number }> } | undefined
  constructor(
    readonly kind: 'audio' | 'video',
    readonly source: string,
  ) {}
  get isDesired() {
    return this.subscribed
  }
  get isSubscribed() {
    return this.subscribed
  }
  setSubscribed(b: boolean) {
    this.subscribed = b
    this.history.push(`subscribed:${b}`)
  }
  setEnabled(b: boolean) {
    this.enabled = b
  }
  setVideoQuality(q: VideoQuality) {
    this.quality = q
  }
}

class FakeLocal {
  connectionQuality = 'good'
  cam = false
  mic = false
  order: string[] = []
  cameraError: Error | null = null
  micError: Error | null = null
  restartTrack = vi.fn(async () => undefined)
  setCameraEnabled = vi.fn(async (b: boolean) => {
    this.order.push(`camera:${b}`)
    if (b && this.cameraError) throw this.cameraError
    this.cam = b
  })
  setMicrophoneEnabled = vi.fn(async (b: boolean) => {
    this.order.push(`mic:${b}`)
    if (b && this.micError) throw this.micError
    this.mic = b
  })
  get isCameraEnabled() {
    return this.cam
  }
  get isMicrophoneEnabled() {
    return this.mic
  }
  getTrackPublication(source: Track.Source) {
    return source === Track.Source.Camera && this.cam ? { videoTrack: { restartTrack: this.restartTrack } } : undefined
  }
}

class FakeRoom extends EventEmitter {
  state: string = ConnectionState.Connected
  canPlaybackAudio = true
  localParticipant = new FakeLocal()
  remoteParticipants = new Map<string, { connectionQuality: string; trackPublications: Map<string, FakePub> }>()
  startAudio = vi.fn(async () => {
    this.canPlaybackAudio = true
  })
  // The controller must never connect or disconnect the room itself
  disconnect = vi.fn()
  connect = vi.fn()
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

function makeRemote(room: FakeRoom) {
  const audio = new FakePub('audio', Track.Source.Microphone)
  const video = new FakePub('video', Track.Source.Camera)
  room.remoteParticipants.set('doctor', { connectionQuality: 'good', trackPublications: new Map<string, FakePub>([['A', audio], ['V', video]]) })
  return { audio, video }
}

async function setup(opts: CallControllerOptions = {}, prepare?: (room: FakeRoom) => void) {
  const room = new FakeRoom()
  const remote = makeRemote(room)
  prepare?.(room)
  const clock = { t: 0 }
  const ctl = new CallController(room as never, { sampleIntervalMs: 0, now: () => clock.t, noticeMs: 10, ...opts })
  ctl.start()
  await flush()
  await ctl.settled()
  /** One policy sample every 2 s for `seconds`. */
  const run = async (quality: string, seconds: number) => {
    room.localParticipant.connectionQuality = quality
    for (let i = 0; i < seconds / 2; i++) {
      clock.t += 2_000
      await ctl.tick()
      await ctl.settled()
    }
  }
  return { room, ctl, remote, clock, run, lp: room.localParticipant }
}

describe('joining: audio first', () => {
  it('publishes the microphone before the camera, starts at the low tier', async () => {
    const { lp, ctl, remote } = await setup()
    expect(lp.order).toEqual(['mic:true', 'camera:true'])
    expect(ctl.getState()).toMatchObject({ phase: 'connected', mode: 'auto', tier: 'low', micOn: true, cameraOn: true })
    expect(remote.video.quality).toBe(VideoQuality.LOW)
    expect(remote.video.subscribed).toBe(true)
  })

  it('weak pre-join hint: joins with audio only first and tells the user', async () => {
    const { lp, ctl } = await setup({ startTier: 'paused' })
    expect(lp.order).toEqual(['mic:true'])
    expect(ctl.getState()).toMatchObject({ tier: 'paused', cameraOn: false, cameraWanted: true, notice: 'startedInAudio' })
  })

  it('patient chose Audio Only before joining: no camera, no remote video download', async () => {
    const { lp, ctl, remote } = await setup({ initialMode: 'audio' })
    expect(lp.order).toEqual(['mic:true'])
    expect(remote.video.subscribed).toBe(false)
    expect(remote.audio.subscribed).toBe(true)
    expect(ctl.getState().mode).toBe('audio')
  })
})

describe('manual Audio Only', () => {
  it('stops our camera and unsubscribes remote video; mic and remote audio stay on; room untouched', async () => {
    const onModeChange = vi.fn()
    const { room, lp, ctl, remote } = await setup({ onModeChange })
    await ctl.setAudioOnly(true)
    expect(lp.cam).toBe(false)
    expect(remote.video.history).toContain('subscribed:false')
    expect(remote.video.subscribed).toBe(false)
    expect(remote.audio.history).toEqual([]) // audio never touched
    expect(remote.audio.subscribed).toBe(true)
    expect(lp.mic).toBe(true)
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledTimes(1) // only the initial enable
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(room.connect).not.toHaveBeenCalled()
    expect(ctl.getState()).toMatchObject({ mode: 'audio', cameraOn: false, cameraWanted: true, micOn: true })
    expect(onModeChange).toHaveBeenCalledWith('audio')
  })

  it('remote video published later (doctor turns camera on) is not downloaded while Audio Only', async () => {
    const { room, ctl } = await setup()
    await ctl.setAudioOnly(true)
    const late = new FakePub('video', Track.Source.Camera)
    room.emit(RoomEvent.TrackPublished, late, {})
    expect(late.subscribed).toBe(false)
    // and a track that gets subscribed anyway (e.g. after a full reconnect) is dropped again
    const resub = new FakePub('video', Track.Source.Camera)
    room.emit(RoomEvent.TrackSubscribed, {}, resub, {})
    expect(resub.subscribed).toBe(false)
  })

  it('back to video without a new room/token: camera on, remote video resubscribed at the LOW layer', async () => {
    const { room, lp, ctl, remote, run } = await setup()
    await run('excellent', 24) // reach the standard tier first
    expect(ctl.getState().tier).toBe('standard')
    expect(remote.video.quality).toBe(VideoQuality.HIGH)
    await ctl.setAudioOnly(true)
    await ctl.setAudioOnly(false)
    expect(lp.cam).toBe(true)
    expect(remote.video.subscribed).toBe(true)
    expect(remote.video.enabled).toBe(true)
    expect(remote.video.quality).toBe(VideoQuality.LOW)
    expect(ctl.getState()).toMatchObject({ mode: 'auto', tier: 'low' })
    expect(room.connect).not.toHaveBeenCalled()
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('stays on until the user turns it off: perfect network does not leave Audio Only', async () => {
    const { lp, ctl, remote, run } = await setup({ initialMode: 'audio' })
    await run('excellent', 300)
    expect(ctl.getState().mode).toBe('audio')
    expect(lp.cam).toBe(false)
    expect(remote.video.subscribed).toBe(false)
  })

  it('pressing Camera while in Audio Only is an explicit choice: leaves Audio Only and turns the camera on', async () => {
    const { lp, ctl } = await setup({ initialMode: 'audio' })
    await ctl.toggleCamera()
    expect(ctl.getState().mode).toBe('auto')
    expect(lp.cam).toBe(true)
  })

  it('leaving Audio Only keeps a camera the user had switched off, off', async () => {
    const { lp, ctl, remote } = await setup()
    await ctl.toggleCamera() // user turns the camera off
    expect(lp.cam).toBe(false)
    await ctl.setAudioOnly(true)
    await ctl.setAudioOnly(false)
    expect(lp.cam).toBe(false)
    expect(remote.video.subscribed).toBe(true) // still sees the doctor
  })
})

describe('AUTO fallback and recovery', () => {
  it('sustained weak: lower quality first, video stays on, audio untouched', async () => {
    const { lp, ctl, remote, run } = await setup()
    await run('excellent', 24)
    expect(remote.video.quality).toBe(VideoQuality.HIGH)
    await run('poor', 12)
    expect(ctl.getState()).toMatchObject({ tier: 'low', cameraOn: true, network: 'weak' })
    expect(remote.video.quality).toBe(VideoQuality.LOW)
    await run('poor', 120)
    expect(ctl.getState().tier).toBe('low') // never paused by "weak" alone
    expect(lp.mic).toBe(true)
  })

  it('sustained severe: pauses video both ways but keeps audio, then restores after sustained recovery', async () => {
    const { lp, ctl, remote, run } = await setup()
    await run('lost', 10)
    expect(ctl.getState()).toMatchObject({ tier: 'paused', cameraOn: false, cameraWanted: true, notice: 'videoPaused', mode: 'auto' })
    expect(remote.video.enabled).toBe(false) // server stops forwarding remote video
    expect(remote.video.subscribed).toBe(true) // kept subscribed for a quick resume
    expect(lp.mic).toBe(true)
    expect(remote.audio.history).toEqual([])
    // brief improvement is not enough
    await run('good', 10)
    expect(ctl.getState().tier).toBe('paused')
    await run('good', 24)
    expect(ctl.getState()).toMatchObject({ tier: 'low', cameraOn: true, notice: 'videoRestored' })
    expect(remote.video.enabled).toBe(true)
    expect(remote.video.quality).toBe(VideoQuality.LOW)
  })

  it('never re-enables a camera the user switched off', async () => {
    const { lp, ctl, run } = await setup()
    await ctl.toggleCamera()
    const before = lp.setCameraEnabled.mock.calls.length
    await run('lost', 10)
    await run('excellent', 120)
    expect(lp.cam).toBe(false)
    expect(lp.setCameraEnabled.mock.calls.slice(before).filter(([on]) => on)).toEqual([])
    expect(ctl.getState().cameraWanted).toBe(false)
  })

  it('user taps Camera while video is auto-paused: tries low video at once', async () => {
    const { lp, ctl, run } = await setup()
    await run('lost', 10)
    expect(lp.cam).toBe(false)
    await ctl.toggleCamera()
    expect(lp.cam).toBe(true)
    expect(ctl.getState().tier).toBe('low')
  })

  it('heavy loss on the received audio (WebRTC stats) triggers the fallback even if the score is good', async () => {
    const { ctl, remote, run } = await setup()
    let lost = 0
    let received = 0
    remote.audio.track = {
      getReceiverStats: async () => {
        lost += 20
        received += 80 // 20 % loss per interval
        return { packetsLost: lost, packetsReceived: received }
      },
    }
    await run('good', 12)
    expect(ctl.getState().tier).toBe('paused')
  })
})

describe('reconnection', () => {
  it('shows reconnecting, freezes the policy, restores the mic and keeps Audio Only', async () => {
    const { room, lp, ctl, remote, run } = await setup({ initialMode: 'audio' })
    room.emit(RoomEvent.Reconnecting)
    expect(ctl.getState().phase).toBe('reconnecting')
    await run('lost', 60) // no samples are used while reconnecting
    lp.mic = false // e.g. the mic track ended during the outage
    room.emit(RoomEvent.Reconnected)
    await flush()
    await ctl.settled()
    expect(ctl.getState()).toMatchObject({ phase: 'connected', mode: 'audio', notice: 'reconnected', micOn: true })
    expect(lp.mic).toBe(true)
    expect(remote.video.subscribed).toBe(false)
    expect(room.disconnect).not.toHaveBeenCalled()
    expect(room.connect).not.toHaveBeenCalled()
  })

  it('a video call resumes conservatively (low tier) after reconnecting', async () => {
    const { room, ctl, remote, run } = await setup()
    await run('excellent', 24)
    expect(ctl.getState().tier).toBe('standard')
    room.emit(RoomEvent.SignalReconnecting)
    room.emit(RoomEvent.Reconnected)
    await flush()
    expect(ctl.getState().tier).toBe('low')
    expect(remote.video.quality).toBe(VideoQuality.LOW)
  })

  it('any path back to Connected ends "reconnecting" exactly once', async () => {
    const { room, ctl } = await setup()
    room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.SignalReconnecting)
    expect(ctl.getState().phase).toBe('reconnecting')
    room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected)
    room.emit(RoomEvent.Reconnected) // the SDK also emits this; must not double-handle
    await flush()
    expect(ctl.getState()).toMatchObject({ phase: 'connected', notice: 'reconnected' })
  })

  it('a terminal disconnect only changes the phase (the page decides; nothing is completed)', async () => {
    const { room, ctl } = await setup()
    room.emit(RoomEvent.Disconnected)
    expect(ctl.getState().phase).toBe('disconnected')
    await ctl.tick() // no further sampling or device changes
    expect(room.connect).not.toHaveBeenCalled()
  })
})

describe('device failures never end the call', () => {
  it('camera permission denied: audio consultation continues, no retry loop', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { room, lp, ctl, run } = await setup({}, (r) => (r.localParticipant.cameraError = err))
    expect(lp.mic).toBe(true)
    expect(ctl.getState()).toMatchObject({ cameraOn: false, cameraWanted: false, cameraError: 'NotAllowedError', notice: 'cameraUnavailable', phase: 'connected' })
    const attempts = lp.setCameraEnabled.mock.calls.length
    await run('excellent', 120)
    expect(lp.setCameraEnabled.mock.calls.length).toBe(attempts)
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('camera fails after connecting (device error event): audio keeps working', async () => {
    const { room, lp, ctl } = await setup()
    room.emit(RoomEvent.MediaDevicesError, Object.assign(new Error('gone'), { name: 'NotReadableError' }), 'videoinput')
    await flush()
    await ctl.settled()
    expect(ctl.getState()).toMatchObject({ cameraWanted: false, cameraError: 'NotReadableError', notice: 'cameraUnavailable' })
    expect(lp.cam).toBe(false)
    expect(lp.mic).toBe(true)
  })

  it('microphone denied: reported to the user, call stays connected, camera still tried', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { room, lp, ctl } = await setup({}, (r) => (r.localParticipant.micError = err))
    expect(ctl.getState()).toMatchObject({ micError: 'NotAllowedError', phase: 'connected' })
    expect(lp.cam).toBe(true)
    expect(room.disconnect).not.toHaveBeenCalled()
    // tapping the mic button retries
    lp.micError = null
    await ctl.toggleMic()
    expect(lp.mic).toBe(true)
    expect(ctl.getState().micError).toBeNull()
  })

  it('mute/unmute is independent of mode changes', async () => {
    const { lp, ctl } = await setup()
    await ctl.toggleMic()
    expect(lp.mic).toBe(false)
    await ctl.setAudioOnly(true)
    await ctl.setAudioOnly(false)
    expect(lp.mic).toBe(false) // the user's mute choice is kept
  })
})

describe('iOS/Android audio playback', () => {
  it('surfaces blocked autoplay and resumes on tap', async () => {
    const { room, ctl } = await setup({}, (r) => (r.canPlaybackAudio = false))
    expect(ctl.getState().canPlayAudio).toBe(false)
    await ctl.startAudio()
    expect(room.startAudio).toHaveBeenCalled()
    expect(ctl.getState().canPlayAudio).toBe(true)
  })
})

describe('camera switching keeps the conservative capture', () => {
  it('restarts with the 360p/15fps constraints and the other facing mode', async () => {
    const { lp, ctl } = await setup()
    await ctl.switchCamera()
    expect(lp.restartTrack).toHaveBeenCalledWith({ resolution: { width: 640, height: 360, frameRate: 15 }, facingMode: 'environment' })
    expect(ctl.getState().facing).toBe('environment')
  })
})
