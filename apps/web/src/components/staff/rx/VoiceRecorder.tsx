'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '@/components/staff/ui'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import { VoiceCapture, type CaptureFailure } from './voice-capture'

const MAX_SECONDS = 5 * 60

const FAILURE_TEXT: Record<CaptureFailure, string> = {
  permission: 'Microphone permission was denied. Allow the microphone for this site in the browser settings, then try again.',
  no_microphone: 'No microphone was found on this device.',
  start_failed: 'The microphone could not be started.',
  interrupted: 'Recording was interrupted. Please record again.',
  empty: 'Nothing was recorded. Please try again.',
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Doctor's voice explanation recorder. Nothing is uploaded until the doctor
 * presses "Save voice note"; a failure here never touches the prescription.
 */
export function VoiceRecorder({
  onSave,
  disabled,
  patientLabel,
  recordLabel = '🎙 Record voice explanation',
  saveLabel = 'Save voice note',
  savingLabel = 'Saving…',
}: {
  onSave: (blob: Blob) => Promise<void>
  disabled?: boolean
  patientLabel?: string
  /** Inbox chat reuses the recorder with its own wording */
  recordLabel?: string
  saveLabel?: string
  savingLabel?: string
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'paused' | 'recorded' | 'saving'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const capture = useRef<VoiceCapture | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  // Counts recorded seconds; stops the recording at the limit (also after Resume)
  const startTimer = () => {
    clearTimer()
    timer.current = setInterval(() => {
      setSeconds((x) => {
        if (x + 1 >= MAX_SECONDS) capture.current?.stop()
        return x + 1
      })
    }, 1000)
  }
  const session = () => {
    if (!capture.current) {
      capture.current = new VoiceCapture(
        { getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c), MediaRecorder },
        {
          onRecording: () => {
            setSeconds(0)
            setState('recording')
            startTimer()
          },
          onRecorded: (b) => {
            clearTimer()
            setBlob(b)
            setUrl((old) => {
              if (old) URL.revokeObjectURL(old)
              return URL.createObjectURL(b)
            })
            setState('recorded')
          },
          onFailed: (reason) => {
            clearTimer()
            setError(FAILURE_TEXT[reason])
            setState('idle')
          },
        },
      )
    }
    return capture.current
  }
  // Unmount: stop the recorder and release the microphone
  useEffect(
    () => () => {
      clearTimer()
      capture.current?.dispose()
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
    const c = session()
    if (c.busy) return // double tap while the microphone is opening
    setError(null)
    setState('starting')
    const r = await c.start()
    if (r === 'busy' || r === 'cancelled') setState((s) => (s === 'starting' ? 'idle' : s))
  }
  const pause = () => {
    if (capture.current?.pause()) {
      clearTimer()
      setState('paused')
    }
  }
  const resume = () => {
    if (capture.current?.resume()) {
      setState('recording')
      startTimer()
    }
  }
  const stop = () => capture.current?.stop()
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
      {(state === 'idle' || state === 'starting') && (
        <Button onClick={() => void start()} disabled={disabled || state === 'starting'} className="min-h-[44px]" data-testid="voice-record">
          {state === 'starting' ? 'Starting microphone…' : recordLabel}
        </Button>
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
            <Button onClick={() => void save()} disabled={state === 'saving'} className="min-h-[44px]">{state === 'saving' ? savingLabel : saveLabel}</Button>
            <Button variant="secondary" onClick={() => (discard(), void start())} disabled={state === 'saving'} className="min-h-[44px]">Record again</Button>
            <ConfirmDeleteButton onConfirm={discard} disabled={state === 'saving'} question="Delete this recording?" />
          </div>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  )
}
