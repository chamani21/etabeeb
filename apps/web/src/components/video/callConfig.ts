/**
 * LiveKit settings for one-to-one consultations on weak mobile networks
 * (livekit-client 2.22.x). Voice first: video is capped well below HD and is
 * the first thing sacrificed; audio is tuned for speech.
 *
 * Who adapts what:
 *  - Upstream video: the browser's congestion control drops the upper simulcast
 *    layer when bandwidth is short; dynacast stops layers nobody watches.
 *  - Downstream video: adaptiveStream sizes the layer to the on-screen element;
 *    the call policy (networkPolicy.ts) additionally caps the requested layer and
 *    pauses video entirely under sustained severe degradation.
 *  - Audio: Opus speech preset + DTX + RED; never paused by the policy.
 */
import { AudioPresets, VideoPreset } from 'livekit-client'
import type { AudioCaptureOptions, ReconnectContext, ReconnectPolicy, RoomOptions, TrackPublishDefaults, VideoCaptureOptions } from 'livekit-client'

/** Camera capture: ~360p, 15 fps. No 720p/1080p capture (CPU, battery, bandwidth). */
export const CAMERA_CAPTURE: VideoCaptureOptions = {
  resolution: { width: 640, height: 360, frameRate: 15 },
  facingMode: 'user',
}

/** Top layer (the capture itself): 360p @ 15 fps, ≤ 300 kbps. */
export const TOP_VIDEO_ENCODING = { maxBitrate: 300_000, maxFramerate: 15 } as const

/**
 * One lower simulcast layer: 320×180 @ 10 fps, ≤ 80 kbps — the "low video" tier.
 * Only one extra layer: browsers limit 360p simulcast to two layers anyway, and a
 * 160×90 layer is too small to recognise a face.
 */
export const LOW_VIDEO_LAYER = new VideoPreset(320, 180, 80_000, 10)

/** Microphone capture: mono speech with the browser's voice processing. */
export const MIC_CAPTURE: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
}

export const PUBLISH_DEFAULTS: TrackPublishDefaults = {
  // Speech preset (24 kbps Opus) instead of the SDK's music default (48 kbps):
  // fully intelligible speech at half the bitrate.
  audioPreset: AudioPresets.speech,
  // DTX: near-zero bitrate while a side is silent (about half of a consultation).
  dtx: true,
  // RED: each packet also carries the previous audio frame, so a single lost
  // packet is recovered. Roughly doubles the audio payload while speaking (~48 kbps
  // instead of ~24 kbps), which is still far below video and keeps speech
  // intelligible under the bursty loss typical of mobile networks. Opus in-band FEC
  // is negotiated by the browser in addition.
  red: true,
  forceStereo: false,
  // Keep the mic track alive while muted: instant unmute, no re-prompt on iOS.
  stopMicTrackOnMute: false,
  videoCodec: 'vp8', // widest hardware/software support incl. iOS Safari and low-cost Android
  backupCodec: false, // only relevant for VP9/AV1 primaries
  simulcast: true,
  videoEncoding: TOP_VIDEO_ENCODING,
  videoSimulcastLayers: [LOW_VIDEO_LAYER],
}

/**
 * Reconnect policy for LiveKit's own recovery (no custom reconnect loop).
 * The SDK default gives up after ~45 s; mobile outages (tunnels, tower handover,
 * Wi-Fi ↔ mobile data) can last longer. We keep trying for up to 2 minutes with
 * capped back-off. The SDK also retries immediately when the browser reports that
 * it is back online.
 */
export const RECONNECT_BUDGET_MS = 120_000
const RETRY_DELAYS_MS = [0, 300, 1_200, 2_700, 4_800]
const MAX_RETRY_DELAY_MS = 7_000

export class ConsultationReconnectPolicy implements ReconnectPolicy {
  constructor(
    private readonly budgetMs = RECONNECT_BUDGET_MS,
    private readonly random: () => number = Math.random,
  ) {}

  nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.elapsedMs >= this.budgetMs) return null
    const base = RETRY_DELAYS_MS[context.retryCount] ?? MAX_RETRY_DELAY_MS
    // Jitter after the first quick attempts, so both sides don't retry in lockstep
    return context.retryCount <= 1 ? base : base + Math.floor(this.random() * 1_000)
  }
}

export function buildRoomOptions(): RoomOptions {
  return {
    // Subscribe to the smallest layer that fills the element; pause video for hidden
    // elements / background tabs. pixelDensity 1: don't request a bigger layer just
    // because the phone has a high-DPI screen.
    adaptiveStream: { pixelDensity: 1, pauseVideoInBackground: true },
    // Stop publishing layers nobody is watching (e.g. the other side is audio-only).
    dynacast: true,
    audioCaptureDefaults: MIC_CAPTURE,
    videoCaptureDefaults: CAMERA_CAPTURE,
    publishDefaults: PUBLISH_DEFAULTS,
    reconnectPolicy: new ConsultationReconnectPolicy(),
    // Leave the room cleanly when the tab is closed (frees the identity at once).
    disconnectOnPageLeave: true,
  }
}
