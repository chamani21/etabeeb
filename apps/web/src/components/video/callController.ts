/**
 * Call controller: owns microphone/camera publishing, remote-video subscriptions,
 * the Audio Only mode and the AUTO network policy for one LiveKit room.
 * Framework-free (React binds to it via useCallController) and testable with a
 * fake room. It never connects/disconnects the room: LiveKit's own reconnect
 * handles transport recovery, and leaving is the user's explicit action.
 *
 * Invariants
 *  - Microphone and remote audio are never touched by mode or network changes.
 *  - Audio Only (manual) stops our camera and unsubscribes remote video; it stays
 *    on until the user turns it off. The network policy never leaves it.
 *  - AUTO may pause video under sustained severe degradation and restores it only
 *    after sustained recovery — and only the camera the user had switched on.
 *  - A camera failure never ends the call; it only disables our video.
 */
import { ConnectionQuality, ConnectionState, RoomEvent, Track, VideoQuality } from 'livekit-client'
import { CAMERA_CAPTURE } from './callConfig'
import { callLog } from './callLog'
import { NetworkPolicy, classify, type LinkQuality, type NetworkLevel, type PolicyChange, type VideoTier } from './networkPolicy'

// ------------------------------------------------------------------
// Minimal structural view of the LiveKit objects we use (real Room satisfies it)
// ------------------------------------------------------------------

export interface RemotePublicationLike {
  kind: string
  source: string
  isDesired: boolean
  isSubscribed: boolean
  setSubscribed(subscribed: boolean): void
  setEnabled(enabled: boolean): void
  setVideoQuality(quality: VideoQuality): void
  track?: { getReceiverStats?: () => Promise<{ packetsLost?: number; packetsReceived?: number } | undefined> } | undefined
}

export interface RemoteParticipantLike {
  connectionQuality: string
  trackPublications: Map<string, RemotePublicationLike>
}

export interface LocalParticipantLike {
  connectionQuality: string
  isCameraEnabled: boolean
  isMicrophoneEnabled: boolean
  setCameraEnabled(enabled: boolean, options?: unknown): Promise<unknown>
  setMicrophoneEnabled(enabled: boolean): Promise<unknown>
  getTrackPublication(source: Track.Source): { videoTrack?: { restartTrack(options?: unknown): Promise<void> } } | undefined
}

export interface CallRoomLike {
  state: string
  canPlaybackAudio: boolean
  localParticipant: LocalParticipantLike
  remoteParticipants: Map<string, RemoteParticipantLike>
  startAudio(): Promise<void>
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
}

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------

export type CallMode = 'auto' | 'audio'
export type CallPhase = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type CallNotice =
  | 'startedInAudio'
  | 'videoReduced'
  | 'videoPaused'
  | 'videoRestored'
  | 'reconnected'
  | 'cameraUnavailable'
  | null

export interface CallState {
  phase: CallPhase
  mode: CallMode
  tier: VideoTier
  /** Own connection, as shown to the user (debounced). */
  network: NetworkLevel | null
  /** The other participant's connection (for the doctor's view). */
  remoteNetwork: NetworkLevel | null
  micOn: boolean
  cameraOn: boolean
  /** The user's own camera choice (AUTO restores only this). */
  cameraWanted: boolean
  cameraError: string | null
  micError: string | null
  notice: CallNotice
  canPlayAudio: boolean
  facing: 'user' | 'environment'
}

export interface CallControllerOptions {
  initialMode?: CallMode | undefined
  micWanted?: boolean | undefined
  cameraWanted?: boolean | undefined
  /** Starting video tier in AUTO (e.g. from the pre-join network hint). */
  startTier?: VideoTier | undefined
  now?: () => number
  /** Sample interval for the network policy; 0 disables the internal timer (tests). */
  sampleIntervalMs?: number
  /** How long transient notices stay visible. */
  noticeMs?: number
  onModeChange?: ((mode: CallMode) => void) | undefined
}

const PERSISTENT_NOTICES: CallNotice[] = ['videoPaused', 'startedInAudio', 'cameraUnavailable']

function errorName(e: unknown): string {
  return e instanceof Error ? e.name || 'Error' : 'Error'
}

export class CallController {
  private readonly policy: NetworkPolicy
  private readonly now: () => number
  private readonly listeners = new Set<() => void>()
  private state: CallState
  private micWanted: boolean
  private timer: ReturnType<typeof setInterval> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private cameraChain: Promise<void> = Promise.resolve()
  private prevAudioStats: { lost: number; received: number } | null = null
  private sampling = false
  private disposed = false
  private connectedOnce = false

  constructor(
    private readonly room: CallRoomLike,
    private readonly opts: CallControllerOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now())
    this.micWanted = opts.micWanted ?? true
    const startTier = opts.startTier ?? 'low'
    this.policy = new NetworkPolicy(startTier, this.now())
    this.state = {
      phase: 'connecting',
      mode: opts.initialMode ?? 'auto',
      tier: startTier,
      network: null,
      remoteNetwork: null,
      micOn: false,
      cameraOn: false,
      cameraWanted: opts.cameraWanted ?? true,
      cameraError: null,
      micError: null,
      notice: null,
      canPlayAudio: room.canPlaybackAudio,
      facing: 'user',
    }
  }

  // ---------------- lifecycle ----------------

  start(): void {
    this.disposed = false
    const r = this.room
    r.on(RoomEvent.Connected, this.handleConnected)
    r.on(RoomEvent.Reconnecting, this.handleReconnecting)
    r.on(RoomEvent.SignalReconnecting, this.handleReconnecting)
    r.on(RoomEvent.Reconnected, this.handleReconnected)
    r.on(RoomEvent.ConnectionStateChanged, this.handleConnectionState)
    r.on(RoomEvent.Disconnected, this.handleDisconnected)
    r.on(RoomEvent.TrackPublished, this.handleRemotePublication)
    r.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
    r.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
    r.on(RoomEvent.ConnectionQualityChanged, this.refresh)
    r.on(RoomEvent.LocalTrackPublished, this.refresh)
    r.on(RoomEvent.LocalTrackUnpublished, this.refresh)
    r.on(RoomEvent.TrackMuted, this.refresh)
    r.on(RoomEvent.TrackUnmuted, this.refresh)
    r.on(RoomEvent.MediaDevicesError, this.handleMediaDevicesError)
    r.on(RoomEvent.AudioPlaybackStatusChanged, this.handleAudioPlayback)
    callLog('CALL_JOIN_STARTED', { mode: this.state.mode, tier: this.state.tier })
    if (r.state === ConnectionState.Connected) void this.handleConnected()
    const every = this.opts.sampleIntervalMs ?? 2_000
    if (every > 0) this.timer = setInterval(() => void this.tick(), every)
  }

  dispose(): void {
    this.disposed = true
    const r = this.room
    r.off(RoomEvent.Connected, this.handleConnected)
    r.off(RoomEvent.Reconnecting, this.handleReconnecting)
    r.off(RoomEvent.SignalReconnecting, this.handleReconnecting)
    r.off(RoomEvent.Reconnected, this.handleReconnected)
    r.off(RoomEvent.ConnectionStateChanged, this.handleConnectionState)
    r.off(RoomEvent.Disconnected, this.handleDisconnected)
    r.off(RoomEvent.TrackPublished, this.handleRemotePublication)
    r.off(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
    r.off(RoomEvent.ParticipantConnected, this.handleParticipantConnected)
    r.off(RoomEvent.ConnectionQualityChanged, this.refresh)
    r.off(RoomEvent.LocalTrackPublished, this.refresh)
    r.off(RoomEvent.LocalTrackUnpublished, this.refresh)
    r.off(RoomEvent.TrackMuted, this.refresh)
    r.off(RoomEvent.TrackUnmuted, this.refresh)
    r.off(RoomEvent.MediaDevicesError, this.handleMediaDevicesError)
    r.off(RoomEvent.AudioPlaybackStatusChanged, this.handleAudioPlayback)
    if (this.timer) clearInterval(this.timer)
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.timer = null
    this.noticeTimer = null
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): CallState => this.state

  /** Resolves once queued camera operations have finished (tests, UI busy state). */
  settled(): Promise<void> {
    return this.cameraChain
  }

  // ---------------- user actions ----------------

  async toggleMic(): Promise<void> {
    const lp = this.room.localParticipant
    const next = !lp.isMicrophoneEnabled
    this.micWanted = next
    try {
      await lp.setMicrophoneEnabled(next)
      this.patch({ micError: null })
    } catch (e) {
      callLog('MICROPHONE_FAILED', { error: errorName(e) })
      this.patch({ micError: errorName(e) })
    }
    this.refresh()
  }

  /** Camera button: an explicit user choice (also leaves Audio Only when turning on). */
  async toggleCamera(): Promise<void> {
    if (this.state.cameraOn || (this.state.cameraWanted && this.state.mode === 'auto' && this.state.tier !== 'paused')) {
      this.patch({ cameraWanted: false })
      await this.syncCamera()
      return
    }
    this.patch({ cameraWanted: true, cameraError: null, notice: this.state.notice === 'cameraUnavailable' ? null : this.state.notice })
    if (this.state.mode === 'audio') {
      await this.setAudioOnly(false)
      return
    }
    this.applyChange(this.policy.userResumedVideo(this.now()))
    await this.syncCamera()
  }

  async setAudioOnly(on: boolean): Promise<void> {
    if ((this.state.mode === 'audio') === on) return
    if (on) {
      callLog('MANUAL_AUDIO_ONLY_ENABLED')
      this.patch({ mode: 'audio', notice: null })
    } else {
      callLog('MANUAL_AUDIO_ONLY_DISABLED')
      this.patch({ mode: 'auto', notice: null })
      // Returning to video always starts at the low tier
      this.applyChange(this.policy.resumeAtLow(this.now()), true)
    }
    this.opts.onModeChange?.(this.state.mode)
    this.applyRemoteAll()
    await this.syncCamera()
  }

  async switchCamera(): Promise<void> {
    const next = this.state.facing === 'user' ? 'environment' : 'user'
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack
    if (!track) return
    try {
      // Keep the conservative capture constraints; only the camera changes
      await track.restartTrack({ ...CAMERA_CAPTURE, facingMode: next })
      this.patch({ facing: next })
    } catch (e) {
      callLog('CAMERA_FAILED', { error: errorName(e), reason: 'switch' })
    }
  }

  async startAudio(): Promise<void> {
    try {
      await this.room.startAudio()
    } finally {
      this.patch({ canPlayAudio: this.room.canPlaybackAudio })
    }
  }

  dismissNotice(): void {
    this.patch({ notice: null })
  }

  // ---------------- room events ----------------

  private handleConnected = async () => {
    if (this.disposed) return
    this.patch({ phase: 'connected', canPlayAudio: this.room.canPlaybackAudio })
    if (this.connectedOnce) return
    this.connectedOnce = true
    callLog('CALL_CONNECTED', { mode: this.state.mode, tier: this.state.tier })
    // Audio first: the consultation must work even if the camera never does
    if (this.micWanted) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(true)
      } catch (e) {
        callLog('MICROPHONE_FAILED', { error: errorName(e) })
        this.patch({ micError: errorName(e) })
      }
    }
    if (!this.room.canPlaybackAudio) callLog('AUDIO_PLAYBACK_BLOCKED')
    if (this.state.mode === 'auto' && this.state.tier === 'paused' && this.state.cameraWanted) {
      this.setNotice('startedInAudio')
    }
    this.applyRemoteAll()
    await this.syncCamera()
    this.refresh()
  }

  private handleReconnecting = () => {
    if (this.state.phase === 'reconnecting') return
    callLog('CALL_RECONNECTING')
    this.policy.onReconnecting()
    this.prevAudioStats = null
    this.patch({ phase: 'reconnecting' })
  }

  /** Belt and braces: any path back to Connected ends the reconnecting state (once). */
  private handleConnectionState = (state: string) => {
    if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) this.handleReconnecting()
    else if (state === ConnectionState.Connected && this.state.phase === 'reconnecting') void this.handleReconnected()
  }

  private handleReconnected = async () => {
    if (this.state.phase !== 'reconnecting') return
    callLog('CALL_RECONNECTED', { mode: this.state.mode })
    this.patch({ phase: 'connected' })
    this.applyChange(this.policy.onReconnected(this.now()), true)
    this.setNotice('reconnected')
    // LiveKit republishes our tracks itself; this only restores an intended mic
    const lp = this.room.localParticipant
    if (this.micWanted && !lp.isMicrophoneEnabled) {
      try {
        await lp.setMicrophoneEnabled(true)
      } catch (e) {
        callLog('MICROPHONE_FAILED', { error: errorName(e), reason: 'reconnect' })
        this.patch({ micError: errorName(e) })
      }
    }
    this.applyRemoteAll()
    await this.syncCamera()
    this.refresh()
  }

  private handleDisconnected = () => {
    this.patch({ phase: 'disconnected' })
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private handleRemotePublication = (pub: RemotePublicationLike) => {
    this.applyRemote(pub)
    this.refresh()
  }

  private handleTrackSubscribed = (_track: unknown, pub: RemotePublicationLike) => {
    this.applyRemote(pub)
    this.refresh()
  }

  private handleParticipantConnected = (p: RemoteParticipantLike) => {
    p.trackPublications.forEach((pub) => this.applyRemote(pub))
    this.refresh()
  }

  private handleMediaDevicesError = (e: unknown, kind?: string) => {
    // Failures of our own enable calls are also caught at the call site
    if (kind === 'audioinput') this.patch({ micError: errorName(e) })
    else if (kind === 'videoinput') {
      this.cameraFailed(e)
      // Unpublish a dead camera so the other side sees "camera off", not a frozen frame
      void this.syncCamera()
    }
  }

  private handleAudioPlayback = () => {
    this.patch({ canPlayAudio: this.room.canPlaybackAudio })
  }

  private refresh = () => {
    const lp = this.room.localParticipant
    const remote = [...this.room.remoteParticipants.values()][0]
    this.patch({
      micOn: lp.isMicrophoneEnabled,
      cameraOn: lp.isCameraEnabled,
      remoteNetwork: remote ? classify({ quality: remote.connectionQuality as LinkQuality }) : null,
    })
  }

  // ---------------- network policy ----------------

  /** One policy sample (every 2 s while connected). */
  async tick(): Promise<void> {
    if (this.disposed || this.state.phase !== 'connected' || this.sampling) return
    this.sampling = true
    try {
      const audioLoss = await this.measureAudioLoss()
      const quality = (this.room.localParticipant.connectionQuality ?? ConnectionQuality.Unknown) as LinkQuality
      const before = this.policy.displayLevel
      const change = this.policy.update({ quality, audioLoss }, this.now())
      const level = this.policy.displayLevel
      if (level !== before) callLog('NETWORK_QUALITY_CHANGED', { level: level ?? 'unknown' })
      this.patch({ network: level })
      this.applyChange(change)
      if (change) await this.syncCamera()
      this.refresh()
    } finally {
      this.sampling = false
    }
  }

  /** Packet loss of the audio we receive, from WebRTC receiver stats (null if too few packets). */
  private async measureAudioLoss(): Promise<number | null> {
    let track: RemotePublicationLike['track']
    for (const p of this.room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === Track.Kind.Audio && pub.track?.getReceiverStats) track = pub.track
      }
    }
    if (!track?.getReceiverStats) return null
    try {
      const s = await track.getReceiverStats()
      if (!s || typeof s.packetsReceived !== 'number') return null
      const cur = { lost: Math.max(0, s.packetsLost ?? 0), received: s.packetsReceived }
      const prev = this.prevAudioStats
      this.prevAudioStats = cur
      if (!prev) return null
      const lost = Math.max(0, cur.lost - prev.lost)
      const received = Math.max(0, cur.received - prev.received)
      // DTX: few packets during silence — not enough to judge
      if (lost + received < 20) return null
      return lost / (lost + received)
    } catch {
      return null
    }
  }

  private applyChange(change: PolicyChange | null, silent = false): void {
    if (!change) return
    const { from, to, reason } = change
    this.patch({ tier: to })
    const auto = this.state.mode === 'auto'
    if (to === 'paused') {
      callLog('AUTO_VIDEO_PAUSED', { from, reason })
      if (auto && !silent) this.setNotice('videoPaused')
    } else if (from === 'paused') {
      callLog('VIDEO_RESTORED', { to, reason })
      if (auto && !silent && reason === 'recovered') this.setNotice('videoRestored')
      else if (this.state.notice === 'videoPaused' || this.state.notice === 'startedInAudio') this.patch({ notice: null })
    } else if (to === 'low') {
      callLog('VIDEO_QUALITY_REDUCED', { from, to, reason })
      if (auto && !silent && reason === 'degraded') this.setNotice('videoReduced')
    } else {
      callLog('VIDEO_QUALITY_RAISED', { from, to, reason })
    }
    this.applyRemoteAll()
  }

  // ---------------- applying the desired state ----------------

  private desiredCamera(): boolean {
    return this.state.cameraWanted && this.state.mode === 'auto' && this.state.tier !== 'paused'
  }

  /** Serialised: rapid toggles converge on the latest desired state. */
  private syncCamera(): Promise<void> {
    this.cameraChain = this.cameraChain.then(async () => {
      if (this.disposed) return
      const lp = this.room.localParticipant
      const want = this.desiredCamera()
      if (want === lp.isCameraEnabled) return
      try {
        await lp.setCameraEnabled(want, want ? { ...CAMERA_CAPTURE, facingMode: this.state.facing } : undefined)
      } catch (e) {
        if (want) this.cameraFailed(e)
      }
      this.refresh()
    })
    return this.cameraChain
  }

  private cameraFailed(e: unknown) {
    callLog('CAMERA_FAILED', { error: errorName(e) })
    // Stop asking for the camera; the audio consultation continues
    this.patch({ cameraWanted: false, cameraError: errorName(e) })
    this.setNotice('cameraUnavailable')
  }

  private applyRemoteAll() {
    for (const p of this.room.remoteParticipants.values()) p.trackPublications.forEach((pub) => this.applyRemote(pub))
  }

  /** Remote VIDEO only; remote audio is never changed. */
  private applyRemote(pub: RemotePublicationLike) {
    if (pub.kind !== Track.Kind.Video) return
    if (this.state.mode === 'audio') {
      // Stop downloading remote video entirely
      if (pub.isDesired) pub.setSubscribed(false)
      return
    }
    if (!pub.isDesired) pub.setSubscribed(true)
    const tier = this.state.tier
    // Paused: stay subscribed (quick resume) but ask the server to stop forwarding
    pub.setEnabled(tier !== 'paused')
    if (tier !== 'paused') pub.setVideoQuality(tier === 'standard' ? VideoQuality.HIGH : VideoQuality.LOW)
  }

  // ---------------- state plumbing ----------------

  private setNotice(notice: CallNotice) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    this.patch({ notice })
    if (notice && !PERSISTENT_NOTICES.includes(notice)) {
      this.noticeTimer = setTimeout(() => {
        if (this.state.notice === notice) this.patch({ notice: null })
      }, this.opts.noticeMs ?? 6_000)
    }
  }

  private patch(p: Partial<CallState>) {
    let changed = false
    for (const k of Object.keys(p) as (keyof CallState)[]) {
      if (this.state[k] !== p[k]) changed = true
    }
    if (!changed) return
    this.state = { ...this.state, ...p }
    this.listeners.forEach((l) => l())
  }
}
