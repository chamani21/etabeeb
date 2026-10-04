'use client'

/**
 * Patient video consultation page — PASHTO ONLY, no login.
 * The URL token is the credential: it is posted to our API (never placed in a
 * query string) and exchanged for a short-lived LiveKit token for exactly this
 * consultation's room. No case id, clinical or payment data is shown.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const VideoRoom = dynamic(() => import('@/components/video/VideoRoom').then((m) => m.VideoRoom), { ssr: false })

const T = {
  brand: 'ای طبیب',
  subtitle: 'آنلاین طبي مشوره',
  doctor: 'ډاکټر',
  time: 'د مشورې وخت',
  pakistanTime: 'د پاکستان وخت',
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
  | { status: 'invalid' | 'revoked' | 'error' }

function fmtPs(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')} (${T.pakistanTime})`
}

async function post(path: string, token: string) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

export default function ConsultPage({ params }: { params: { token: string } }) {
  const token = params.token
  const [access, setAccess] = useState<Access>({ status: 'loading' })
  const [phase, setPhase] = useState<'prejoin' | 'joining' | 'incall' | 'left' | 'failed'>('prejoin')
  const [call, setCall] = useState<{ serverUrl: string; participantToken: string } | null>(null)
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)

  const load = useCallback(async () => {
    const r = await post('/api/video/patient/access', token).catch(() => null)
    if (!r) return setAccess({ status: 'error' })
    setAccess(r.ok ? (r.json as Access) : { status: 'invalid' })
  }, [token])
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (access.status !== 'too_early') return
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [access.status, load])

  const join = async () => {
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
            <p className="mt-1"><span className="font-semibold">{T.time}:</span> <span dir="ltr" className="inline-block">{fmtPs(info.scheduledAt)}</span></p>
          </section>
        )}

        {access.status === 'loading' && <Box>{T.loading}</Box>}
        {access.status === 'invalid' && <Box kind="error">{T.invalid}</Box>}
        {access.status === 'error' && <Box kind="error">{T.failed} <RetryButton onClick={() => void load()} /></Box>}
        {access.status === 'revoked' && <Box kind="error">{T.revoked}</Box>}
        {access.status === 'expired' && <Box kind="error">{T.expired}</Box>}
        {access.status === 'ended' && <Box>{T.ended}</Box>}
        {access.status === 'not_configured' && <Box kind="warning">{T.notConfigured}</Box>}
        {access.status === 'too_early' && info && (
          <Box kind="warning">
            {T.tooEarly} <span dir="ltr" className="inline-block font-semibold">{fmtPs(info.opensAt)}</span>
            <p className="mt-2 text-sm">{T.autoRefresh}</p>
          </Box>
        )}

        {access.status === 'ok' && phase === 'prejoin' && (
          <PreJoin camOn={camOn} micOn={micOn} setCamOn={setCamOn} setMicOn={setMicOn} onJoin={() => void join()} />
        )}
        {access.status === 'ok' && phase === 'joining' && <Box>{T.loading}</Box>}
        {phase === 'incall' && call && (
          <VideoRoom
            serverUrl={call.serverUrl}
            token={call.participantToken}
            lang="ps"
            audio={micOn}
            video={camOn}
            onLeave={() => (setCall(null), setPhase('left'))}
            onDropped={() => (setCall(null), setPhase('failed'))}
          />
        )}
        {phase === 'left' && (
          <Box>
            {T.left}
            <div className="mt-3"><BigButton onClick={() => void (setPhase('prejoin'), load())}>{T.rejoin}</BigButton></div>
          </Box>
        )}
        {phase === 'failed' && (
          <Box kind="error">
            {T.failed}
            <div className="mt-3"><BigButton onClick={() => void join()}>{T.retry}</BigButton></div>
          </Box>
        )}
        <p className="text-center text-xs text-gray-500">{T.privacy}</p>
      </div>
    </main>
  )
}

function PreJoin({ camOn, micOn, setCamOn, setMicOn, onJoin }: { camOn: boolean; micOn: boolean; setCamOn: (v: boolean) => void; setMicOn: (v: boolean) => void; onJoin: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState(0)

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return setError(T.unsupported)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setReady(true)
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return setError(T.noDevice)
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // Find out which permission was refused
        const camOk = await navigator.mediaDevices.getUserMedia({ video: true }).then((s) => (s.getTracks().forEach((t) => t.stop()), true)).catch(() => false)
        return setError(camOk ? T.micDenied : T.cameraDenied)
      }
      setError(T.unsupported)
    }
  }, [])

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
      <div className={`relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg bg-gray-900 sm:aspect-video sm:max-w-md ${ready ? '' : 'hidden'}`}>
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        {!camOn && <div className="absolute inset-0 flex items-center justify-center text-white">{T.cameraOff}</div>}
      </div>
      {ready && (
        <>
          <div className="space-y-1">
            <div className="text-sm">{micOn ? T.micOn : T.micOff} — {T.speakToTest}</div>
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200" dir="ltr"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${micOn ? level : 0}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton on={camOn} onClick={() => setCamOn(!camOn)}>{camOn ? T.turnCameraOff : T.turnCameraOn}</ToggleButton>
            <ToggleButton on={micOn} onClick={() => setMicOn(!micOn)}>{micOn ? T.turnMicOff : T.turnMicOn}</ToggleButton>
          </div>
          <BigButton onClick={() => (stop(), onJoin())}>{T.join}</BigButton>
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
