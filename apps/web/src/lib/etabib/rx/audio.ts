/**
 * eTabib V1 — voice explanation audio processing (FFmpeg).
 *
 * Browsers record WebM/Opus (Chrome, Android) or MP4/AAC (iPhone Safari).
 * WhatsApp only renders a native voice message for OGG + OPUS (mono), so
 * every recording is transcoded deterministically; the original is kept.
 *
 *   FFMPEG_PATH / FFPROBE_PATH   binaries (default: ffmpeg / ffprobe on PATH)
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

export const VOICE_MAX_BYTES = 10 * 1024 * 1024 // upload limit (WhatsApp audio limit is 16 MB)
export const VOICE_MAX_SECONDS = 5 * 60
export const VOICE_MIN_SECONDS = 1

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

/** Duration in milliseconds of an audio file (decodes the stream when the container has no duration). */
export async function probeDurationMs(file: string): Promise<number> {
  try {
    const { stdout } = await run(ffprobe(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { timeout: 20_000 })
    const s = Number.parseFloat(stdout.trim())
    if (Number.isFinite(s) && s > 0) return Math.round(s * 1000)
  } catch {
    /* fall through to a decode pass */
  }
  // MediaRecorder WebM often has no duration header: decode to null and read the last timestamp
  try {
    const { stderr } = await run(ffmpeg(), ['-hide_banner', '-nostats', '-i', file, '-f', 'null', '-'], { timeout: 60_000 })
    const all = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
    const m = all[all.length - 1]
    if (m) return Math.round(((+m[1]! * 60 + +m[2]!) * 60 + +m[3]!) * 1000)
  } catch {
    /* invalid media */
  }
  throw new AudioError('invalid_audio', 'The recording could not be read')
}

/** Transcode to OGG/Opus mono 48 kHz (WhatsApp voice message). Never modifies the input. */
export async function transcodeToVoiceOgg(input: string, output: string): Promise<void> {
  try {
    await run(
      ffmpeg(),
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', output],
      { timeout: 120_000 },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 120) : 'ffmpeg failed'
    throw new AudioError('audio_conversion_failed', `Audio conversion failed (${msg})`)
  }
}
