/**
 * Voice note audio pipeline (real FFmpeg): server-side validation of uploaded
 * recordings and the WhatsApp rendition (OGG/Opus mono 48 kHz 24 kbps).
 * Synthetic signals only.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { AudioError, VOICE_OUTPUT, prepareVoiceNote, validateRecording, verifyVoiceOgg } from '@/lib/etabib/rx/audio'
import { chromeWebm, cutOff, hasFfmpeg, interleavedWebm, probeFile, safariMp4 } from './audio-fixtures'

const write = (data: Buffer, name: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'voice-audio-')), name)
  writeFileSync(file, data)
  return file
}
const outPath = () => path.join(mkdtempSync(path.join(tmpdir(), 'voice-out-')), 'voice.ogg')
const rejectsWith = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(AudioError)
  expect((e as AudioError).code).toBe(code)
}

describe.skipIf(!hasFfmpeg)('voice recording validation', () => {
  it('accepts a Chrome/Android WebM/Opus recording (no duration header) with its real length', async () => {
    const r = await validateRecording(write(chromeWebm(3), 'chrome.webm'))
    expect(r.codec).toBe('opus')
    expect(r.durationMs).toBeGreaterThan(2700)
    expect(r.durationMs).toBeLessThan(3300)
  })

  it('accepts iPhone Safari MP4/AAC, fragmented and plain', async () => {
    for (const fragmented of [true, false]) {
      const r = await validateRecording(write(safariMp4(3, fragmented), 'safari.m4a'))
      expect(r.codec).toBe('aac')
      expect(r.durationMs).toBeGreaterThan(2700)
      expect(r.durationMs).toBeLessThan(3300)
    }
  })

  it('rejects an empty upload and non-audio data as invalid_audio', async () => {
    await rejectsWith(validateRecording(write(Buffer.alloc(0), 'empty.webm')), 'invalid_audio')
    await rejectsWith(validateRecording(write(Buffer.from('this is not audio at all, just text'), 'text.webm')), 'invalid_audio')
    await rejectsWith(validateRecording(write(Buffer.from('<html><body>hello</body></html>'), 'page.m4a')), 'invalid_audio')
  })

  it('rejects a WebM upload that was cut off as audio_truncated', async () => {
    await rejectsWith(validateRecording(write(cutOff(chromeWebm(4)), 'cut.webm')), 'audio_truncated')
  })

  it('rejects a plain MP4 whose index never arrived (cut off) as audio_truncated', async () => {
    await rejectsWith(validateRecording(write(cutOff(safariMp4(4, false), 0.5), 'cut.m4a')), 'audio_truncated')
  })

  it('rejects two recordings interleaved by a double tap (production failure) as audio_malformed', async () => {
    await rejectsWith(validateRecording(write(interleavedWebm(4), 'mixed.webm')), 'audio_malformed')
  })

  it('does not reject a recording only because of small timestamp irregularities', async () => {
    // Re-mux a valid recording with a start offset and generated timestamps: still one continuous recording
    const { spawnSync } = await import('child_process')
    const src = write(chromeWebm(3), 'src.webm')
    const shifted = path.join(path.dirname(src), 'shifted.webm')
    const r = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-fflags', '+genpts', '-i', src, '-c', 'copy', '-output_ts_offset', '0.5', shifted])
    expect(r.status).toBe(0)
    const ok = await validateRecording(shifted)
    expect(ok.durationMs).toBeGreaterThan(2500)
  })
})

describe.skipIf(!hasFfmpeg)('WhatsApp voice rendition', () => {
  it.each([
    ['Chrome WebM/Opus', () => chromeWebm(4), 'rec.webm'],
    ['Safari fragmented MP4/AAC', () => safariMp4(4, true), 'rec.m4a'],
    ['Safari MP4/AAC', () => safariMp4(4, false), 'rec.m4a'],
  ])('%s → OGG/Opus mono 48 kHz ~24 kbps, same length', async (_name, make, filename) => {
    const out = outPath()
    const { durationMs } = await prepareVoiceNote(write(make(), filename), out)
    const p = probeFile(out)
    expect(p).toMatchObject({ codec: VOICE_OUTPUT.codec, channels: 1, sampleRate: 48000 })
    expect(p.format).toBe('ogg')
    expect(Math.abs(p.durationMs - durationMs)).toBeLessThan(300)
    expect(p.bitRate).toBeGreaterThan(12_000)
    expect(p.bitRate).toBeLessThan(30_000) // was 32 kbps; 24 kbps for low-bandwidth patients
  })

  it('enforces the 1 s minimum before converting', async () => {
    await rejectsWith(prepareVoiceNote(write(chromeWebm(0.4), 'short.webm'), outPath()), 'audio_too_short')
  })

  it('never converts a malformed or truncated upload', async () => {
    const out = outPath()
    await rejectsWith(prepareVoiceNote(write(interleavedWebm(4), 'mixed.webm'), out), 'audio_malformed')
    await rejectsWith(prepareVoiceNote(write(cutOff(chromeWebm(4)), 'cut.webm'), out), 'audio_truncated')
    const { existsSync } = await import('fs')
    expect(existsSync(out)).toBe(false)
  })

  it('verifyVoiceOgg refuses a file that is not the WhatsApp voice format', async () => {
    const webm = write(chromeWebm(2), 'not-ogg.webm')
    await rejectsWith(verifyVoiceOgg(webm, 2000), 'audio_conversion_failed')
    const out = outPath()
    await prepareVoiceNote(write(chromeWebm(2), 'ok.webm'), out)
    await rejectsWith(verifyVoiceOgg(out, 10_000), 'audio_conversion_failed') // wrong length
  })
})
