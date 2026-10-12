/**
 * eTabib V1 — voice explanation audio processing (FFmpeg).
 *
 * Browsers record WebM/Opus (Chrome, Android) or MP4/AAC (iPhone Safari).
 * WhatsApp only renders a native voice message for OGG + OPUS (mono), so
 * every recording is validated, then transcoded deterministically to
 * OGG/Opus mono 48 kHz 24 kbps (low bandwidth); the original is kept.
 *
 *   FFMPEG_PATH / FFPROBE_PATH   binaries (default: ffmpeg / ffprobe on PATH)
 */
import { execFile } from 'child_process'
import { open, stat } from 'fs/promises'
import { promisify } from 'util'

const run = promisify(execFile)

export const VOICE_MAX_BYTES = 10 * 1024 * 1024 // upload limit (WhatsApp audio limit is 16 MB)
export const VOICE_MAX_SECONDS = 5 * 60
export const VOICE_MIN_SECONDS = 1
/** WhatsApp voice note rendition: OGG/Opus mono 48 kHz at 24 kbps (~180 KB per minute). */
export const VOICE_OUTPUT = { codec: 'opus', channels: 1, sampleRate: 48000, bitrate: '24k' } as const

/** Container formats browsers produce, by MIME type (parameters such as codecs ignored). */
export const VOICE_INPUT_TYPES: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/webm': 'webm', // some browsers label audio-only WebM as video/webm
  'video/mp4': 'm4a',
}

export function baseMime(type: string): string {
  return type.split(';')[0]!.trim().toLowerCase()
}

const ffmpeg = () => process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
const ffprobe = () => process.env.FFPROBE_PATH?.trim() || 'ffprobe'

export class AudioError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'AudioError'
  }
}

/**
 * A packet stamped this far BEFORE the latest one already seen means two
 * recordings were spliced/interleaved (e.g. two MediaRecorders writing into one
 * upload). Ordinary timestamp jitter (duplicates, a few ms back) stays well below.
 */
const BACKWARD_JUMP_SECONDS = 0.25
/** Demuxer messages that mean the upload ends mid-structure. */
const TRUNCATED_RE = /ended prematurely|partial file|unexpected end of|moov atom not found/i
/** Decoder messages that mean damaged audio data (timestamp-only warnings are not counted). */
const DECODE_ERROR_RE = /error while decoding|invalid data|corrupt|error parsing|decode error|invalid packet/i
const TIMESTAMP_ONLY_RE = /\b(dts|pts|timestamps?)\b/i

const stderrOf = (error: unknown): string => (error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr ?? '') : '')

type ProbeJson = {
  streams?: { index: number; codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string }[]
  packets?: { stream_index: number; pts_time?: string }[]
  format?: { format_name?: string; duration?: string }
}

/** Starts like a WebM/Matroska (EBML) or MP4 (ftyp) container: only then can an unreadable file be a cut-off recording. */
async function looksLikeRecording(file: string): Promise<boolean> {
  const fh = await open(file, 'r').catch(() => null)
  if (!fh) return false
  try {
    const head = Buffer.alloc(12)
    await fh.read(head, 0, 12, 0)
    return head.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) || head.subarray(4, 8).toString('latin1') === 'ftyp'
  } finally {
    await fh.close()
  }
}

async function probe(file: string, packets: boolean): Promise<{ json: ProbeJson; stderr: string }> {
  const entries = 'stream=index,codec_type,codec_name,channels,sample_rate:format=format_name,duration' + (packets ? ':packet=stream_index,pts_time' : '')
  try {
    const { stdout, stderr } = await run(ffprobe(), ['-v', 'error', '-print_format', 'json', '-show_entries', entries, file], { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 })
    return { json: JSON.parse(stdout) as ProbeJson, stderr }
  } catch (error) {
    if (TRUNCATED_RE.test(stderrOf(error)) && (await looksLikeRecording(file))) throw new AudioError('audio_truncated', 'The recording is incomplete (upload cut off). Please record again.')
    throw new AudioError('invalid_audio', 'The recording could not be read')
  }
}

/**
 * Validate an uploaded recording and return its duration (ms). Rejects:
 *  - no audio stream / no audio packets           → invalid_audio
 *  - demuxer reports the file ends mid-structure  → audio_truncated
 *  - two recordings interleaved (large backward timestamp jump) → audio_malformed
 *  - undecodable or substantially damaged audio   → invalid_audio
 * Small timestamp irregularities (duplicates, jitter) are accepted.
 */
export async function validateRecording(file: string): Promise<{ durationMs: number; codec: string }> {
  const size = await stat(file).then((s) => s.size, () => 0)
  if (size === 0) throw new AudioError('invalid_audio', 'The recording is empty')
  const { json, stderr: probeErr } = await probe(file, true)
  const audio = json.streams?.find((s) => s.codec_type === 'audio')
  if (!audio) throw new AudioError('invalid_audio', 'The recording has no audio')
  if (TRUNCATED_RE.test(probeErr)) throw new AudioError('audio_truncated', 'The recording is incomplete (upload cut off). Please record again.')
  const pts = (json.packets ?? []).filter((p) => p.stream_index === audio.index).map((p) => Number.parseFloat(p.pts_time ?? '')).filter(Number.isFinite)
  if (pts.length === 0) throw new AudioError('invalid_audio', 'The recording is empty')
  let latest = -Infinity
  for (const t of pts) {
    if (t < latest - BACKWARD_JUMP_SECONDS) throw new AudioError('audio_malformed', 'The recording is damaged (two recordings were mixed). Please record again.')
    if (t > latest) latest = t
  }

  // Full decode: catches damaged data and gives the real duration (MediaRecorder WebM often has none in its header)
  let decodeErr: string
  let progress: string
  try {
    const r = await run(ffmpeg(), ['-nostdin', '-hide_banner', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-i', file, '-map', `0:${audio.index}`, '-f', 'null', '-'], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })
    decodeErr = r.stderr
    progress = r.stdout
  } catch (error) {
    if (TRUNCATED_RE.test(stderrOf(error))) throw new AudioError('audio_truncated', 'The recording is incomplete (upload cut off). Please record again.')
    throw new AudioError('invalid_audio', 'The recording could not be decoded')
  }
  if (TRUNCATED_RE.test(decodeErr)) throw new AudioError('audio_truncated', 'The recording is incomplete (upload cut off). Please record again.')
  const damaged = decodeErr.split('\n').filter((l) => DECODE_ERROR_RE.test(l) && !TIMESTAMP_ONLY_RE.test(l)).length
  if (damaged > Math.max(2, pts.length * 0.02)) throw new AudioError('invalid_audio', 'The recording is damaged and cannot be played')

  const outTimes = [...progress.matchAll(/out_time_us=(\d+)/g)]
  const decodedUs = outTimes.length ? Number(outTimes[outTimes.length - 1]![1]) : NaN
  const durationMs = Number.isFinite(decodedUs) && decodedUs > 0 ? Math.round(decodedUs / 1000) : Math.round((latest - Math.min(...pts)) * 1000)
  if (!(durationMs > 0)) throw new AudioError('invalid_audio', 'The recording is empty')
  return { durationMs, codec: audio.codec_name ?? 'unknown' }
}

/** Duration in milliseconds of an audio file (validates it first). */
export async function probeDurationMs(file: string): Promise<number> {
  return (await validateRecording(file)).durationMs
}

/** Transcode to the WhatsApp voice rendition (OGG/Opus mono 48 kHz 24 kbps). Never modifies the input. */
export async function transcodeToVoiceOgg(input: string, output: string): Promise<void> {
  try {
    await run(
      ffmpeg(),
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-map', '0:a:0', '-map_metadata', '-1', '-ac', String(VOICE_OUTPUT.channels), '-ar', String(VOICE_OUTPUT.sampleRate), '-c:a', 'libopus', '-b:a', VOICE_OUTPUT.bitrate, '-application', 'voip', '-f', 'ogg', output],
      { timeout: 120_000 },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 120) : 'ffmpeg failed'
    throw new AudioError('audio_conversion_failed', `Audio conversion failed (${msg})`)
  }
}

/** The rendition must be exactly what WhatsApp plays as a voice note, and as long as the recording. */
export async function verifyVoiceOgg(file: string, expectedMs: number): Promise<void> {
  const { json } = await probe(file, false).catch(() => {
    throw new AudioError('audio_conversion_failed', 'Audio conversion produced an unreadable file')
  })
  const a = json.streams?.find((s) => s.codec_type === 'audio')
  const durationMs = Math.round(Number.parseFloat(json.format?.duration ?? '') * 1000)
  const ok =
    (json.streams ?? []).length === 1 &&
    a?.codec_name === VOICE_OUTPUT.codec &&
    a.channels === VOICE_OUTPUT.channels &&
    Number(a.sample_rate) === VOICE_OUTPUT.sampleRate &&
    /(^|,)ogg(,|$)/.test(json.format?.format_name ?? '') &&
    Number.isFinite(durationMs) &&
    Math.abs(durationMs - expectedMs) <= Math.max(1000, expectedMs * 0.1)
  if (!ok) throw new AudioError('audio_conversion_failed', 'Audio conversion produced an unexpected file')
}

/**
 * Validate a stored recording, enforce the length limits, write the WhatsApp
 * rendition and check it. Shared by the doctor's prescription voice note and
 * the inbox voice message so both send identical audio.
 */
export async function prepareVoiceNote(originalPath: string, outputPath: string): Promise<{ durationMs: number }> {
  const { durationMs } = await validateRecording(originalPath)
  if (durationMs < VOICE_MIN_SECONDS * 1000) throw new AudioError('audio_too_short', 'The recording is too short')
  if (durationMs > VOICE_MAX_SECONDS * 1000 + 999) throw new AudioError('audio_too_long', 'The recording is longer than 5 minutes')
  await transcodeToVoiceOgg(originalPath, outputPath)
  await verifyVoiceOgg(outputPath, durationMs)
  return { durationMs }
}
