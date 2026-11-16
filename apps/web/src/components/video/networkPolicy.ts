/**
 * Debounced video policy for the AUTO call mode. Pure (no LiveKit, no timers):
 * the call controller feeds samples and applies the returned tier.
 *
 * Signals: LiveKit's per-participant connection quality (a coarse score computed
 * by the server from loss/jitter/RTT — not a bandwidth measurement) and, when
 * available, the measured packet loss of the audio we receive (WebRTC stats).
 *
 * Rules
 *  - Only sustained conditions change anything; one step at a time:
 *      standard → low → paused (video off, audio kept), and back up again.
 *  - Weak connection lowers video quality but never pauses it on its own.
 *  - Very weak connection (lost / heavy audio loss) steps down, eventually pausing video.
 *  - Recovery needs a longer stable period than degradation; resuming from paused
 *    needs longer still. A downgrade soon after an upgrade doubles the recovery
 *    hold (anti-oscillation), up to a cap.
 *  - While reconnecting nothing changes; after reconnecting video resumes at most
 *    at the low tier.
 */

export type LinkQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'
export type NetworkLevel = 'good' | 'weak' | 'very_weak'
export type VideoTier = 'standard' | 'low' | 'paused'

export interface PolicySample {
  quality: LinkQuality
  /** Fraction (0..1) of incoming audio packets lost since the previous sample. */
  audioLoss?: number | null | undefined
}

export interface PolicyConfig {
  /** Weak, sustained → standard to low. */
  degradeAfterMs: number
  /** Very weak, sustained → one step down (low → paused). */
  severeAfterMs: number
  /** Good, sustained → one step up (low → standard). */
  recoverAfterMs: number
  /** Good, sustained → paused to low (resume video). */
  resumeAfterMs: number
  /** Upper bound for the anti-oscillation back-off. */
  maxRecoverMs: number
  /** A downgrade within this time after an upgrade counts as oscillation. */
  flapWindowMs: number
  /** A level must persist this long before it is shown to the user. */
  displayAfterMs: number
}

export const DEFAULT_POLICY: PolicyConfig = {
  degradeAfterMs: 8_000,
  severeAfterMs: 6_000,
  recoverAfterMs: 20_000,
  resumeAfterMs: 30_000,
  maxRecoverMs: 120_000,
  flapWindowMs: 60_000,
  displayAfterMs: 3_000,
}

/** Audio loss thresholds (fraction of packets). */
const WEAK_AUDIO_LOSS = 0.05
const SEVERE_AUDIO_LOSS = 0.12

export function classify(sample: PolicySample): NetworkLevel | null {
  const loss = sample.audioLoss ?? 0
  switch (sample.quality) {
    case 'lost':
      return 'very_weak'
    case 'poor':
      return loss >= SEVERE_AUDIO_LOSS ? 'very_weak' : 'weak'
    case 'good':
    case 'excellent':
      if (loss >= SEVERE_AUDIO_LOSS) return 'very_weak'
      return loss >= WEAK_AUDIO_LOSS ? 'weak' : 'good'
    default:
      return null // no information: hold
  }
}

export type PolicyChange = { from: VideoTier; to: VideoTier; reason: 'degraded' | 'recovered' | 'reconnected' | 'manual' }

const ORDER: VideoTier[] = ['paused', 'low', 'standard']
const down = (t: VideoTier): VideoTier => ORDER[Math.max(0, ORDER.indexOf(t) - 1)]!
const up = (t: VideoTier): VideoTier => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(t) + 1)]!

export class NetworkPolicy {
  private _tier: VideoTier
  private level: NetworkLevel | null = null
  private levelSince = 0
  private lastStepAt: number
  private lastUpgradeAt = -Infinity
  private lastDowngradeAt = -Infinity
  private recoverHoldMs: number
  private reconnecting = false
  private _displayLevel: NetworkLevel | null = null

  constructor(
    initialTier: VideoTier = 'low',
    now = 0,
    private readonly cfg: PolicyConfig = DEFAULT_POLICY,
  ) {
    this._tier = initialTier
    this.lastStepAt = now
    this.recoverHoldMs = cfg.recoverAfterMs
  }

  get tier(): VideoTier {
    return this._tier
  }

  /** Level shown to users: only once it has persisted for displayAfterMs. */
  get displayLevel(): NetworkLevel | null {
    return this._displayLevel
  }

  get isReconnecting(): boolean {
    return this.reconnecting
  }

  /** Feed one sample; returns the tier change, if any. */
  update(sample: PolicySample, now: number): PolicyChange | null {
    if (this.reconnecting) return null
    const level = classify(sample)
    if (level === null) {
      this.level = null // missing data breaks a streak; never acts on it
      return null
    }
    if (level !== this.level) {
      this.level = level
      this.levelSince = now
    }
    if (now - this.levelSince >= this.cfg.displayAfterMs) this._displayLevel = level

    // Every step needs its own sustained window
    const sustained = now - Math.max(this.levelSince, this.lastStepAt)
    const from = this._tier
    if (level === 'very_weak' && from !== 'paused' && sustained >= this.cfg.severeAfterMs) {
      return this.step(down(from), now, 'degraded')
    }
    if (level === 'weak' && from === 'standard' && sustained >= this.cfg.degradeAfterMs) {
      return this.step('low', now, 'degraded')
    }
    if (level === 'good' && from !== 'standard') {
      const hold = from === 'paused' ? Math.max(this.cfg.resumeAfterMs, this.recoverHoldMs) : this.recoverHoldMs
      if (sustained >= hold) return this.step(up(from), now, 'recovered')
    }
    return null
  }

  onReconnecting(): void {
    this.reconnecting = true
    this.level = null
  }

  /** After a reconnect, resume conservatively (at most the low tier). */
  onReconnected(now: number): PolicyChange | null {
    this.reconnecting = false
    this.level = null
    this.lastStepAt = now
    if (this._tier === 'standard') return this.step('low', now, 'reconnected')
    return null
  }

  /** The user explicitly turned the camera on while video was paused: try low. */
  userResumedVideo(now: number): PolicyChange | null {
    if (this._tier !== 'paused') return null
    return this.step('low', now, 'manual')
  }

  /** Leaving Audio Only: video always restarts at the low tier, then recovers normally. */
  resumeAtLow(now: number): PolicyChange | null {
    this.level = null
    return this.step('low', now, 'manual')
  }

  private step(to: VideoTier, now: number, reason: PolicyChange['reason']): PolicyChange | null {
    const from = this._tier
    if (to === from) return null
    const isUpgrade = ORDER.indexOf(to) > ORDER.indexOf(from)
    if (isUpgrade) {
      // Long stable period since the last downgrade: forget earlier oscillation
      if (now - this.lastDowngradeAt > 3 * this.cfg.flapWindowMs) this.recoverHoldMs = this.cfg.recoverAfterMs
      this.lastUpgradeAt = now
    } else {
      if (reason === 'degraded' && now - this.lastUpgradeAt < this.cfg.flapWindowMs) {
        this.recoverHoldMs = Math.min(this.recoverHoldMs * 2, this.cfg.maxRecoverMs)
      }
      this.lastDowngradeAt = now
    }
    this._tier = to
    this.lastStepAt = now
    return { from, to, reason }
  }
}

/**
 * Hint from the browser's Network Information API (Chrome/Android only; Safari
 * has none). Used once before joining to decide whether to start with video.
 */
export function startTierFromHint(conn: { effectiveType?: string } | null | undefined): VideoTier {
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return 'paused'
  return 'low'
}
