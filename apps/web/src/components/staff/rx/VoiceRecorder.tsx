'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '@/components/staff/ui'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'

const MAX_SECONDS = 5 * 60

/** Best container the browser can record: WebM/Opus (Chrome, Android, Firefox) or MP4/AAC (iPhone Safari). */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t
  }
  return undefined
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Doctor's voice explanation recorder. Nothing is uploaded until the doctor
 * presses "Save voice note"; a failure here never touches the prescription.
 */
export function VoiceRecorder({ onSave, disabled, patientLabel }: { onSave: (blob: Blob) => Promise<void>; disabled?: boolean; patientLabel?: string }) {
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'recorded' | 'saving'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }
  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  useEffect(
    () => () => {
      clearTimer()
      stopTracks()
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Warn before leaving with an unsaved recording
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused' && state !== 'recorded') return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [state])

  const start = async () => {
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = s
      const mimeType = pickMimeType()
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      r.onstop = () => {
        clearTimer()
        stopTracks()
        const b = new Blob(chunks.current, { type: r.mimeType || mimeType || 'audio/webm' })
        if (b.size === 0) {
          setError('Nothing was recorded. Please try again.')
          setState('idle')
          return
        }
        setBlob(b)
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old)
          return URL.createObjectURL(b)
        })
        setState('recorded')
      }
      r.onerror = () => {
        setError('Recording was interrupted. Please record again.')
        clearTimer()
        stopTracks()
        setState('idle')
      }
      rec.current = r
      r.start(1000)
      setSeconds(0)
      setState('recording')
      timer.current = setInterval(() => {
        setSeconds((x) => {
          if (x + 1 >= MAX_SECONDS && rec.current && rec.current.state !== 'inactive') rec.current.stop()
          return x + 1
        })
      }, 1000)
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission was denied. Allow the microphone for this site in the browser settings, then try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No microphone was found on this device.'
            : 'The microphone could not be started.',
      )
      stopTracks()
      setState('idle')
    }
  }
  const pause = () => {
    if (rec.current?.state === 'recording' && typeof rec.current.pause === 'function') {
      rec.current.pause()
      clearTimer()
      setState('paused')
    }
  }
  const resume = () => {
    if (rec.current?.state === 'paused') {
      rec.current.resume()
      setState('recording')
      timer.current = setInterval(() => setSeconds((x) => x + 1), 1000)
    }
  }
  const stop = () => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }
  const discard = () => {
    setBlob(null)
    if (url) URL.revokeObjectURL(url)
    setUrl(null)
    setSeconds(0)
    setState('idle')
  }
  const save = async () => {
    if (!blob) return
    setState('saving')
    setError(null)
    try {
      await onSave(blob)
      discard()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — the recording is kept, try again.')
      setState('recorded')
    }
  }

  if (!supported) return <Notice kind="warning">This browser cannot record audio. The prescription can still be sent without a voice note.</Notice>
  return (
    <div className="space-y-2" data-testid="voice-recorder">
      {patientLabel && <p className="text-sm">For: <b>{patientLabel}</b></p>}
      {state === 'idle' && (
        <Button onClick={() => void start()} disabled={disabled} className="min-h-[44px]">🎙 Record voice explanation</Button>
      )}
      {(state === 'recording' || state === 'paused') && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
          <span className={`inline-block h-3 w-3 rounded-full ${state === 'recording' ? 'animate-pulse bg-red-600' : 'bg-gray-400'}`} />
          <span className="font-mono text-sm font-semibold" data-testid="voice-timer">{mmss(seconds)}</span>
          <span className="text-xs text-gray-600">max {mmss(MAX_SECONDS)}</span>
          <div className="ml-auto flex gap-2">
            {state === 'recording' && typeof MediaRecorder !== 'undefined' && 'pause' in MediaRecorder.prototype && (
              <Button variant="secondary" onClick={pause} className="min-h-[44px]">Pause</Button>
            )}
            {state === 'paused' && <Button variant="secondary" onClick={resume} className="min-h-[44px]">Resume</Button>}
            <Button variant="danger" onClick={stop} className="min-h-[44px]">Stop</Button>
          </div>
        </div>
      )}
      {(state === 'recorded' || state === 'saving') && url && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-2">
          <audio controls src={url} className="w-full" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={state === 'saving'} className="min-h-[44px]">{state === 'saving' ? 'Saving…' : 'Save voice note'}</Button>
            <Button variant="secondary" onClick={() => (discard(), void start())} disabled={state === 'saving'} className="min-h-[44px]">Record again</Button>
            <ConfirmDeleteButton onConfirm={discard} disabled={state === 'saving'} question="Delete this recording?" />
          </div>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  )
}
