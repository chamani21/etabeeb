/**
 * Structured call diagnostics (browser console only). Event names and coarse
 * technical state only — never names, phone numbers, room names, tokens,
 * identities or anything clinical.
 */
export type CallLogEvent =
  | 'CALL_JOIN_STARTED'
  | 'CALL_CONNECTED'
  | 'CALL_RECONNECTING'
  | 'CALL_RECONNECTED'
  | 'CALL_USER_ENDED'
  | 'CALL_NETWORK_FAILED'
  | 'CALL_ENDED_BY_SERVER'
  | 'NETWORK_QUALITY_CHANGED'
  | 'VIDEO_QUALITY_REDUCED'
  | 'VIDEO_QUALITY_RAISED'
  | 'AUTO_VIDEO_PAUSED'
  | 'VIDEO_RESTORED'
  | 'MANUAL_AUDIO_ONLY_ENABLED'
  | 'MANUAL_AUDIO_ONLY_DISABLED'
  | 'CAMERA_FAILED'
  | 'MICROPHONE_FAILED'
  | 'AUDIO_PLAYBACK_BLOCKED'

type Detail = Record<string, string | number | boolean | null | undefined>

const ALLOWED_KEYS = new Set(['tier', 'from', 'to', 'reason', 'level', 'mode', 'error', 'quality', 'role'])

export function callLog(event: CallLogEvent, detail: Detail = {}): void {
  const safe: Detail = {}
  for (const [k, v] of Object.entries(detail)) if (ALLOWED_KEYS.has(k)) safe[k] = typeof v === 'string' ? v.slice(0, 40) : v
  try {
    console.info(`[etabib:call] ${event}`, JSON.stringify(safe))
  } catch {
    /* logging must never break a call */
  }
}
