'use client'

/**
 * Patient video consultation page — PASHTO ONLY, no login.
 * The URL token is the credential: it is posted to our API (never placed in a
 * query string) and exchanged for a short-lived LiveKit token for exactly this
 * consultation's room. No case id, clinical or payment data is shown.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { formatConsultationForPatient } from '@/lib/etabib/patient-time'
import { VIDEO_LABELS } from '@/components/video/labels'
import type { CallMode } from '@/components/video/callController'
import { startTierFromHint, type VideoTier } from '@/components/video/networkPolicy'

const VideoRoom = dynamic(() => import('@/components/video/VideoRoom').then((m) => m.VideoRoom), { ssr: false })
const L = VIDEO_LABELS.ps

/** Network Information API hint (Chrome/Android only); never blocks joining. */
function networkHintTier(): VideoTier {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
  return startTierFromHint(conn)
}

const T = {
  brand: 'ای طبیب',
  subtitle: 'آنلاین طبي مشوره',
  doctor: 'ډاکټر',
  time: 'د مشورې وخت',
  pakistanTime: 'د پاکستان وخت',
  afghanistanTime: 'د افغانستان وخت',
  loading: 'لږ صبر وکړئ…',
  explain:
    'د مشورې لپاره ستاسو کیمرې او مایکروفون ته اجازه پکار ده. کله چې براوزر پوښتنه وکړي، «اجازه ورکړئ» (Allow) کېکاږئ.',
  checkDevices: 'کیمره او مایکروفون چک کړئ',
  join: 'مشورې ته ورننوځئ',
  cameraOn: 'کیمره روښانه ده',
  cameraOff: 'کیمره بنده ده',
  micOn: 'مایکروفون روښانه دی',
  micOff: 'مایکروفون بند دی',
  turnCameraOn: 'کیمره روښانه کړئ',
  turnCameraOff: 'کیمره بنده کړئ',
  turnMicOn: 'مایکروفون روښانه کړئ',
  turnMicOff: 'مایکروفون بند کړئ',
  speakToTest: 'خبرې وکړئ — که مایکروفون کار کوي، دا کرښه به حرکت وکړي',
  cameraDenied: 'کیمرې ته اجازه ورنه کړل شوه. د براوزر په تنظیماتو کې کیمرې ته اجازه ورکړئ او پاڼه بیا پرانیزئ.',
  micDenied: 'مایکروفون ته اجازه ورنه کړل شوه. د براوزر په تنظیماتو کې مایکروفون ته اجازه ورکړئ او پاڼه بیا پرانیزئ.',
  noDevice: 'کیمره یا مایکروفون ونه موندل شو. وګورئ چې ستاسو ټیلیفون یا کمپیوټر کیمره او مایکروفون لري.',
  unsupported: 'دا براوزر ویډیو مشوره نه ملاتړ کوي. مهرباني وکړئ په Chrome یا Safari کې دا لینک پرانیزئ.',
  invalid: 'دا لینک سم نه دی. مهرباني وکړئ هغه لینک وکاروئ چې موږ درته په واټساپ کې استولی دی.',
  revoked: 'دا لینک نور د اعتبار وړ نه دی. که نوی لینک مو نه وي ترلاسه کړی، له موږ سره په واټساپ اړیکه ونیسئ.',
  expired: 'د دې لینک موده پای ته رسېدلې ده. مهرباني وکړئ له موږ سره په واټساپ اړیکه ونیسئ.',
  ended: 'دا مشوره پای ته رسېدلې ده. مننه چې ای طبیب مو وکاراوه.',
  cancelled: 'دا مشوره لغوه شوې ده.',
  cancelledHelp: 'که مرستې ته اړتیا لرئ یا غواړئ بله مشوره وټاکئ، زموږ له استازي سره اړیکه ونیسئ.',
  talkToRepresentative: 'له استازي سره په واټساپ خبرې وکړئ',
  tooEarly: 'لا وخت نه دی شوی. تاسو کولی شئ له دې وخت نه وروسته ورننوځئ:',
  autoRefresh: 'دا پاڼه پخپله تازه کېږي.',
  notConfigured: 'ویډیو مشوره اوس چمتو نه ده. مهرباني وکړئ لږ وروسته بیا هڅه وکړئ.',
  failed: 'اړیکه ونه شوه. خپل انټرنېټ وګورئ او بیا هڅه وکړئ.',
  retry: 'بیا هڅه وکړئ',
  left: 'تاسو له مشورې ووتلئ.',
  rejoin: 'بیا ورننوځئ',
  privacy: 'دا لینک یوازې ستاسو لپاره دی. له بل چا سره یې مه شریکوئ.',
} as const

type Access =
  | { status: 'loading' }
  | { status: 'ok' | 'too_early' | 'expired' | 'ended' | 'not_configured'; info?: { doctorName: string; scheduledAt: string; opensAt: string } }
  | { status: 'cancelled'; helpUrl?: string | null }
  | { status: 'invalid' | 'revoked' | 'error' }

/** Consultation time for both countries (shared formatter: one timestamp, two local dates/times). */
function BothTimes({ iso }: { iso: string }) {
  const t = formatConsultationForPatient(new Date(iso))
  return (
    <span className="mt-1 block space-y-0.5" data-testid="both-times">
      <span className="block">🇵🇰 {T.pakistanTime}: <b className="inline-block" dir="rtl">{t.pakistan.date} — {t.pakistan.time}</b></span>
      <span className="block">🇦🇫 {T.afghanistanTime}: <b className="inline-block" dir="rtl">{t.afghanistan.date} — {t.afghanistan.time}</b></span>
    </span>
  )
}

async function post(path: string, token: string) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

export default function ConsultPage({ params }: { params: { token: string } }) {
  const token = params.token
  const [access, setAccess] = useState<Access>({ status: 'loading' })
  const [phase, setPhase] = useState<'prejoin' | 'joining' | 'incall' | 'left' | 'failed' | 'elsewhere'>('prejoin')
  const [call, setCall] = useState<{ serverUrl: string; participantToken: string } | null>(null)
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  // Kept across retries/rejoins: a patient who chose Audio Only stays in it
  const [mode, setMode] = useState<CallMode>('auto')
  const [startTier, setStartTier] = useState<VideoTier>('low')

  const load = useCallback(async () => {
    const r = await post('/api/video/patient/access', token).catch(() => null)
    if (!r) return setAccess({ status: 'error' })
    // A gateway/server hiccup on a weak network is not an invalid link
    setAccess(r.ok ? (r.json as Access) : r.status >= 500 || r.status === 429 ? { status: 'error' } : { status: 'invalid' })
  }, [token])
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (access.status !== 'too_early') return
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [access.status, load])

  const join = async () => {
    setStartTier(networkHintTier())
    setPhase('joining')
    const r = await post('/api/video/patient/token', token).catch(() => null)
    if (!r?.ok) {
      const code = String(r?.json?.code ?? '')
      if (code.startsWith('video_')) return void (await load(), setPhase('prejoin'))
      return setPhase('failed')
    }
    setCall({ serverUrl: r.json.serverUrl, participantToken: r.json.participantToken })
    setPhase('incall')
  }

  const info = 'info' in access ? access.info : undefined
  return (
    <main dir="rtl" lang="ps" className="min-h-screen bg-[#e6fff6] px-3 py-4 text-gray-900">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-[#0B3D2E]">{T.brand}</h1>
          <p className="text-sm text-gray-600">{T.subtitle}</p>
        </header>

        {info && phase !== 'incall' && (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-lg"><span className="font-semibold">{T.doctor}:</span> {info.doctorName}</p>
            <div className="mt-1"><span className="font-semibold">{T.time}:</span> <BothTimes iso={info.scheduledAt} /></div>
          </section>
        )}

        {access.status === 'loading' && <Box>{T.loading}</Box>}
        {access.status === 'invalid' && <Box kind="error">{T.invalid}</Box>}
        {access.status === 'error' && phase !== 'failed' && <Box kind="error">{T.failed} <RetryButton onClick={() => void load()} /></Box>}
        {access.status === 'revoked' && <Box kind="error">{T.revoked}</Box>}
        {access.status === 'expired' && <Box kind="error">{T.expired}</Box>}
        {access.status === 'ended' && <Box>{T.ended}</Box>}
        {access.status === 'cancelled' && (
          <Box kind="warning">
            <p className="font-semibold">{T.cancelled}</p>
            <p className="mt-2">{T.cancelledHelp}</p>
            {access.helpUrl && /^https:\/\//.test(access.helpUrl) && (
              <a href={access.helpUrl} rel="noopener noreferrer" className="mt-3 flex min-h-[48px] items-center justify-center rounded-xl bg-[#25D366] px-4 text-base font-semibold text-white" data-testid="representative-link">
                {T.talkToRepresentative}
              </a>
            )}
          </Box>
        )}
        {access.status === 'not_configured' && <Box kind="warning">{T.notConfigured}</Box>}
        {access.status === 'too_early' && info && (
          <Box kind="warning">
            {T.tooEarly} <BothTimes iso={info.opensAt} />
            <p className="mt-2 text-sm">{T.autoRefresh}</p>
          </Box>
        )}

        {access.status === 'ok' && phase === 'prejoin' && (
          <PreJoin
            camOn={camOn}
            micOn={micOn}
            setCamOn={setCamOn}
            setMicOn={setMicOn}
            onJoin={(audioOnly) => {
              setMode(audioOnly ? 'audio' : 'auto')
              void join()
            }}
          />
        )}
        {access.status === 'ok' && phase === 'joining' && <Box>{T.loading}</Box>}
        {phase === 'incall' && call && (
          <VideoRoom
            serverUrl={call.serverUrl}
            token={call.participantToken}
            lang="ps"
            audio={micOn}
            video={camOn}
            initialMode={mode}
            startTier={startTier}
            onModeChange={setMode}
            onLeave={() => (setCall(null), setPhase('left'))}
            onDropped={(reason) => {
              setCall(null)
              setPhase(reason === 'DUPLICATE_IDENTITY' ? 'elsewhere' : 'failed')
              // A dropped call is never treated as finished: ask the server for the real status
              void load()
            }}
          />
        )}
        {phase === 'left' && (
          <Box>
            {T.left}
            <div className="mt-3"><BigButton onClick={() => void (setPhase('prejoin'), load())}>{T.rejoin}</BigButton></div>
          </Box>
        )}
        {phase === 'failed' && (access.status === 'ok' || access.status === 'error') && (
          <Box kind="error">
            {T.failed}
            <p className="mt-2 text-sm">{L.droppedReassure}</p>
            <div className="mt-3"><BigButton onClick={() => void join()}>{T.retry}</BigButton></div>
          </Box>
        )}
        {phase === 'elsewhere' && access.status === 'ok' && (
          <Box kind="warning">
            {L.openedElsewhere}
            <div className="mt-3"><BigButton onClick={() => void join()}>{T.rejoin}</BigButton></div>
          </Box>
        )}
        <p className="text-center text-xs text-gray-500">{T.privacy}</p>
      </div>
    </main>
  )
}

function PreJoin({ camOn, micOn, setCamOn, setMicOn, onJoin }: { camOn: boolean; micOn: boolean; setCamOn: (v: boolean) => void; setMicOn: (v: boolean) => void; onJoin: (audioOnly: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState(0)
  // Camera refused/missing/busy but the microphone works: offer an audio consultation
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [weakNetwork, setWeakNetwork] = useState(false)
  useEffect(() => setWeakNetwork(networkHintTier() === 'paused'), [])

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = useCallback(async () => {
    setError(null)
    setCameraBlocked(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return setError(T.unsupported)
    try {
      // Same modest capture size as the call (≈360p): less CPU on low-cost phones
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } }, audio: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setReady(true)
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      if (['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(name)) {
        // Is the microphone alone usable? Then the consultation can go ahead with audio only.
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
        if (audioStream) {
          streamRef.current = audioStream
          setCameraBlocked(true)
          setCamOn(false)
          setReady(true)
          return
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') return setError(T.noDevice)
        if (name === 'NotAllowedError' || name === 'SecurityError') return setError(T.micDenied)
      }
      setError(T.unsupported)
    }
  }, [setCamOn])

  useEffect(() => () => stop(), [])

  // Simple microphone level meter
  useEffect(() => {
    const stream = streamRef.current
    if (!ready || !stream || !stream.getAudioTracks()[0]) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      setLevel(Math.min(100, Math.round((data.reduce((a, b) => a + b, 0) / data.length) * 1.5)))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => (cancelAnimationFrame(raf), void ctx.close())
  }, [ready])

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOn))
  }, [camOn, ready])
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn))
  }, [micOn, ready])

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <p>{T.explain}</p>
      {!ready && !error && <BigButton onClick={() => void start()}>{T.checkDevices}</BigButton>}
      {error && (
        <Box kind="error">
          {error}
          <div className="mt-3"><BigButton onClick={() => void start()}>{T.retry}</BigButton></div>
        </Box>
      )}
      <div className={`relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg bg-gray-900 sm:aspect-video sm:max-w-md ${ready && !cameraBlocked ? '' : 'hidden'}`}>
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        {!camOn && <div className="absolute inset-0 flex items-center justify-center text-white">{T.cameraOff}</div>}
      </div>
      {ready && (
        <>
          <div className="space-y-1">
            <div className="text-sm">{micOn ? T.micOn : T.micOff} — {T.speakToTest}</div>
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200" dir="ltr"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${micOn ? level : 0}%` }} /></div>
          </div>
          {cameraBlocked && <Box kind="warning">{L.cameraDeniedAudio}</Box>}
          {weakNetwork && !cameraBlocked && <Box kind="warning">{L.weakNetworkHint}</Box>}
          <div className={`grid gap-2 ${cameraBlocked ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!cameraBlocked && <ToggleButton on={camOn} onClick={() => setCamOn(!camOn)}>{camOn ? T.turnCameraOff : T.turnCameraOn}</ToggleButton>}
            <ToggleButton on={micOn} onClick={() => setMicOn(!micOn)}>{micOn ? T.turnMicOff : T.turnMicOn}</ToggleButton>
          </div>
          {cameraBlocked ? (
            <BigButton onClick={() => (stop(), onJoin(true))}>🎧 {L.joinAudioOnly}</BigButton>
          ) : (
            <>
              <BigButton onClick={() => (stop(), onJoin(false))}>{T.join}</BigButton>
              <button
                type="button"
                onClick={() => (stop(), onJoin(true))}
                className="min-h-[48px] w-full rounded-xl border-2 border-[#0B3D2E] bg-white px-4 text-base font-semibold text-[#0B3D2E]"
                data-testid="join-audio-only"
              >
                🎧 {L.joinAudioOnly}
              </button>
              <p className="text-center text-sm text-gray-600">{L.joinAudioOnlyHint}</p>
            </>
          )}
        </>
      )}
    </section>
  )
}

function Box({ children, kind = 'info' }: { children: React.ReactNode; kind?: 'info' | 'error' | 'warning' }) {
  const cls = { info: 'bg-white', error: 'border border-red-200 bg-red-50 text-red-900', warning: 'border border-amber-200 bg-amber-50 text-amber-900' }[kind]
  return <section className={`rounded-xl p-4 text-base leading-relaxed shadow-sm ${cls}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</section>
}

function BigButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[52px] w-full rounded-xl bg-[#0B3D2E] px-4 text-lg font-semibold text-white active:bg-emerald-900">
      {children}
    </button>
  )
}

function ToggleButton({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-[48px] rounded-xl border px-3 text-sm font-semibold ${on ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-900 bg-gray-900 text-white'}`}>
      {children}
    </button>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return <div className="mt-3"><BigButton onClick={onClick}>{T.retry}</BigButton></div>
}
