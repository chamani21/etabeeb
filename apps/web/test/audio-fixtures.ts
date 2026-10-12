/**
 * Synthetic recordings for voice-note tests (no real voices). Shapes mirror what
 * browsers upload: Chrome/Android MediaRecorder WebM/Opus with ~1 s clusters,
 * iPhone Safari MP4/AAC (plain and fragmented), plus the damaged uploads seen
 * in production: two recorders interleaved, and files cut off mid-upload.
 */
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
export const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(FFPROBE, ['-version']).status === 0

const dir = () => mkdtempSync(path.join(tmpdir(), 'voice-fixture-'))

function ffmpeg(args: string[], out: string): Buffer {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out])
  if (r.status !== 0) throw new Error(`ffmpeg could not create ${path.basename(out)}: ${String(r.stderr).slice(0, 200)}`)
  return readFileSync(out)
}

/** Speech-like test signal: a tone over soft pink noise (exercises the encoder like a voice does). */
const signal = (seconds: number, freq: number) => ['-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.08:duration=${seconds}`, '-filter_complex', 'amix=inputs=2:duration=shortest']

/** Chrome / Android MediaRecorder: WebM, Opus 60 ms frames, ~1 s clusters (r.start(1000)). */
export function chromeWebm(seconds = 3, freq = 440): Buffer {
  return ffmpeg([...signal(seconds, freq), '-ac', '1', '-c:a', 'libopus', '-frame_duration', '60', '-cluster_time_limit', '1000', '-f', 'webm'], path.join(dir(), 'chrome.webm'))
}

/** iPhone Safari MediaRecorder: MP4/AAC; Safari 17+ uploads fragmented MP4. */
export function safariMp4(seconds = 3, fragmented = true): Buffer {
  return ffmpeg([...signal(seconds, 330), '-ac', '1', '-c:a', 'aac', '-b:a', '64k', ...(fragmented ? ['-movflags', 'frag_keyframe+empty_moov+default_base_moof'] : []), '-f', 'mp4'], path.join(dir(), 'safari.m4a'))
}

const CLUSTER_ID = Buffer.from('1F43B675', 'hex')

/** WebM split into [header, cluster1, cluster2, …] at Cluster element ids. */
function clusters(webm: Buffer): Buffer[] {
  const at: number[] = []
  for (let i = webm.indexOf(CLUSTER_ID); i !== -1; i = webm.indexOf(CLUSTER_ID, i + 1)) at.push(i)
  if (at.length < 2) throw new Error('fixture needs several clusters')
  return [webm.subarray(0, at[0]), ...at.map((s, k) => webm.subarray(s, at[k + 1] ?? webm.length))]
}

/**
 * The production failure: two MediaRecorders (double tap) pushing their 1 s
 * chunks into one upload — A's first chunk, B's first chunk, A's second, B's
 * second… Each recorder's timestamps start again at 0.
 */
export function interleavedWebm(seconds = 4): Buffer {
  const [aHead, ...a] = clusters(chromeWebm(seconds, 300))
  const [bHead, ...b] = clusters(chromeWebm(seconds, 600))
  const parts: Buffer[] = [aHead!, a[0]!, bHead!, b[0]!]
  for (let k = 1; k < Math.max(a.length, b.length); k++) {
    if (a[k]) parts.push(a[k]!)
    if (b[k]) parts.push(b[k]!)
  }
  return Buffer.concat(parts)
}

/** An upload that stopped part-way. */
export function cutOff(file: Buffer, fraction = 0.6): Buffer {
  return file.subarray(0, Math.floor(file.length * fraction))
}

export interface ProbeInfo {
  codec: string
  channels: number
  sampleRate: number
  format: string
  durationMs: number
  bitRate: number
}

export function probeFile(file: string): ProbeInfo {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_entries', 'stream=codec_name,channels,sample_rate:format=format_name,duration,bit_rate', file])
  const j = JSON.parse(String(r.stdout)) as { streams: { codec_name: string; channels: number; sample_rate: string }[]; format: { format_name: string; duration: string; bit_rate: string } }
  return {
    codec: j.streams[0]!.codec_name,
    channels: j.streams[0]!.channels,
    sampleRate: Number(j.streams[0]!.sample_rate),
    format: j.format.format_name,
    durationMs: Math.round(Number(j.format.duration) * 1000),
    bitRate: Number(j.format.bit_rate),
  }
}
