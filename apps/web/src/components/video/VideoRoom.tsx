'use client'

/**
 * Shared call UI (patient + doctor), built on LiveKit's React primitives.
 * Mobile-first: remote participant fills the screen, own camera as a small
 * inset, large touch controls. The token/server URL come from our backend only.
 *
 * Voice first: the microphone is published before the camera, a camera failure
 * never ends the call, and "Audio only" stops video both ways without leaving
 * the room. Call logic lives in callController.ts; this file only renders it.
 */
import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, isTrackReference, useRoomContext, useRemoteParticipants, useTracks } from '@livekit/components-react'
import { DisconnectReason, Room, Track } from 'livekit-client'
import { buildRoomOptions } from './callConfig'
import type { CallMode, CallNotice, CallState } from './callController'
import { callLog } from './callLog'
import { VIDEO_LABELS, type VideoLabels, type VideoLang } from './labels'
import type { VideoTier } from './networkPolicy'
import { useCallController } from './useCallController'

/** Server-side ends: the room was closed (completion/cancellation) or this identity was replaced. */
const SERVER_ENDED = new Set<DisconnectReason>([DisconnectReason.ROOM_DELETED, DisconnectReason.PARTICIPANT_REMOVED, DisconnectReason.DUPLICATE_IDENTITY, DisconnectReason.ROOM_CLOSED])

export function disconnectReasonName(reason?: DisconnectReason): string {
  return reason === undefined ? 'UNKNOWN' : (DisconnectReason[reason] ?? 'UNKNOWN')
}

export interface VideoRoomProps {
  serverUrl: string
  token: string
  lang: VideoLang
  /** Initial microphone choice. */
  audio: boolean
  /** Initial camera choice (the user's; AUTO only restores what the user switched on). */
  video: boolean
  /** Start in Audio Only (kept across rejoins by the caller). */
  initialMode?: CallMode
  /** Start AUTO with video paused (pre-join network hint). */
  startTier?: VideoTier
  /** Doctor view shows the patient's connection state. */
  role?: 'patient' | 'doctor'
  onModeChange?: (mode: CallMode) => void
  /** User pressed Leave (intentional). */
  onLeave: () => void
  /**
   * The call ended without the user pressing Leave: network failure after the
   * reconnect budget, or the server closed/replaced the session. The reason is a
   * LiveKit DisconnectReason name. Never means the consultation was completed —
   * that is decided by the case status on the server only.
   */
  onDropped: (reason: string) => void
}

export function VideoRoom({ serverUrl, token, lang, audio, video, initialMode = 'auto', startTier, role = 'patient', onModeChange, onLeave, onDropped }: VideoRoomProps) {
  // A ref (not state): onDisconnected fires before React re-renders after Leave
  const leavingRef = useRef(false)
  // Our own Room so the options (codecs, layers, reconnect policy) apply exactly
  const [room] = useState(() => new Room(buildRoomOptions()))
  return (
    <LiveKitRoom
      room={room}
      serverUrl={serverUrl}
      token={token}
      connect
      // Publishing is done by the call controller: mic first, camera second, and a
      // camera failure must not be reported as a call failure.
      audio={false}
      video={false}
      onDisconnected={(reason) => {
        if (leavingRef.current) {
          callLog('CALL_USER_ENDED')
          return onLeave()
        }
        const name = disconnectReasonName(reason)
        callLog(reason !== undefined && SERVER_ENDED.has(reason) ? 'CALL_ENDED_BY_SERVER' : 'CALL_NETWORK_FAILED', { reason: name })
        onDropped(name)
      }}
      onError={(e) => {
        // Joining failed (signal/ICE) — nothing was ended on the server
        callLog('CALL_NETWORK_FAILED', { reason: 'join', error: e?.name ?? 'error' })
        onDropped(e?.name ?? 'error')
      }}
      className="relative flex h-full min-h-[70vh] w-full flex-col overflow-hidden rounded-lg bg-gray-950 text-white"
      data-lk-theme="none"
    >
      <CallStage
        lang={lang}
        role={role}
        opts={{ initialMode, startTier, micWanted: audio, cameraWanted: video, onModeChange }}
        onLeaveClick={() => (leavingRef.current = true)}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function CallStage({
  lang,
  role,
  opts,
  onLeaveClick,
}: {
  lang: VideoLang
  role: 'patient' | 'doctor'
  opts: Parameters<typeof useCallController>[1]
  onLeaveClick: () => void
}) {
  const L: VideoLabels = VIDEO_LABELS[lang]
  const room = useRoomContext()
  const { controller, state: s } = useCallController(room, opts)
  const remotes = useRemoteParticipants()
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })
  const remoteCam = cameraTracks.find((t) => !t.participant.isLocal)
  const localCam = cameraTracks.find((t) => t.participant.isLocal)
  const [canSwitch, setCanSwitch] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices?.().then((d) => setCanSwitch(d.filter((x) => x.kind === 'videoinput').length > 1)).catch(() => undefined)
  }, [s.cameraOn])

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch {
      /* the controller reports failures through its state */
    } finally {
      setBusy(false)
    }
  }

  const audioOnly = s.mode === 'audio'
  const videoPaused = !audioOnly && s.tier === 'paused'
  const showRemoteVideo =
    !audioOnly && !videoPaused && !!remoteCam && isTrackReference(remoteCam) && !!remoteCam.publication?.isSubscribed && !remoteCam.publication.isMuted
  const placeholder = audioOnly
    ? L.audioOnlyPlaceholder
    : videoPaused
      ? L.videoPausedPlaceholder
      : remotes.length > 0
        ? `${L.otherConnected} — ${L.cameraIsOff}`
        : L.waitingForOther
  const banner = s.phase === 'reconnecting' ? L.connectionInterrupted : s.phase === 'connecting' ? L.connecting : null

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="relative flex-1 bg-black">
        {showRemoteVideo && remoteCam && isTrackReference(remoteCam) ? (
          <VideoTrack trackRef={remoteCam} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-base text-gray-200" data-testid="remote-placeholder">
            {(audioOnly || videoPaused) && <span className="text-5xl" aria-hidden>🎧</span>}
            <span>{placeholder}</span>
          </div>
        )}
        <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start justify-between gap-2 text-xs">
          <span className="rounded bg-black/60 px-2 py-1" data-testid="peer-status">
            {remotes.length > 0 ? `● ${L.otherConnected}` : `○ ${L.waitingForOther}`}
          </span>
          <NetworkPill L={L} s={s} role={role} />
        </div>
        <div className="absolute inset-x-3 top-12 flex flex-col items-center gap-2">
          {banner && (
            <div className="w-fit max-w-full rounded bg-amber-500 px-3 py-1 text-center text-sm font-semibold text-black" role="status" data-testid="call-banner">
              {banner}
            </div>
          )}
          {!s.canPlayAudio && (
            <button type="button" onClick={() => void controller.startAudio()} className="min-h-[48px] rounded-full bg-emerald-500 px-5 text-sm font-semibold text-black">
              🔊 {L.tapToHear}
            </button>
          )}
          {s.micError && (
            <div className="w-fit max-w-full rounded bg-red-600 px-3 py-1 text-center text-sm font-semibold" role="alert">
              {L.micUnavailable}
            </div>
          )}
          <NoticeBox L={L} notice={s.notice} audioOnly={audioOnly} onClose={() => controller.dismissNotice()} />
        </div>
        <div className="absolute bottom-3 right-3 h-36 w-24 overflow-hidden rounded-md border border-white/30 bg-gray-800 sm:h-40 sm:w-56">
          {localCam && isTrackReference(localCam) && s.cameraOn ? (
            <VideoTrack trackRef={localCam} className="h-full w-full object-cover" style={{ transform: s.facing === 'user' ? 'scaleX(-1)' : undefined }} />
          ) : (
            <div className="flex h-full items-center justify-center p-1 text-center text-xs text-gray-300">{L.you}: {L.cameraIsOff}</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 bg-gray-900 p-3" dir="ltr">
        <CallButton active={s.micOn} disabled={busy} onClick={() => act(() => controller.toggleMic())} testId="mic-toggle">
          {s.micOn ? `🎙 ${L.mute}` : `🔇 ${L.unmute}`}
        </CallButton>
        <CallButton active={s.cameraOn} disabled={busy} onClick={() => act(() => controller.toggleCamera())} testId="camera-toggle">
          {s.cameraOn ? `📷 ${L.cameraOff}` : `🚫 ${L.cameraOn}`}
        </CallButton>
        <button
          type="button"
          aria-pressed={audioOnly}
          disabled={busy}
          onClick={() => act(() => controller.setAudioOnly(!audioOnly))}
          data-testid="audio-only-toggle"
          className={`min-h-[48px] rounded-full px-4 text-sm font-bold disabled:opacity-50 ${audioOnly ? 'bg-amber-400 text-black ring-2 ring-amber-200' : 'bg-emerald-700 text-white'}`}
        >
          {audioOnly ? `🎥 ${L.backToVideo}` : `🎧 ${L.audioOnly}`}
        </button>
        {canSwitch && s.cameraOn && (
          <CallButton active disabled={busy} onClick={() => act(() => controller.switchCamera())}>
            🔄 {L.switchCamera}
          </CallButton>
        )}
        <LeaveButton label={L.leave} onClick={onLeaveClick} />
      </div>
    </div>
  )
}

function NetworkPill({ L, s, role }: { L: VideoLabels; s: CallState; role: 'patient' | 'doctor' }) {
  const own =
    s.phase !== 'connected' || !s.network
      ? null
      : s.network === 'good'
        ? { text: L.netGood, cls: 'bg-emerald-700/80' }
        : s.network === 'weak'
          ? { text: L.netWeak, cls: 'bg-amber-500 text-black' }
          : { text: L.netVeryWeak, cls: 'bg-red-600' }
  const otherWeak = role === 'doctor' && s.phase === 'connected' && (s.remoteNetwork === 'weak' || s.remoteNetwork === 'very_weak')
  return (
    <span className="flex flex-col items-end gap-1" data-testid="network-status">
      {s.mode === 'audio' && <span className="rounded bg-amber-400 px-2 py-1 font-semibold text-black">🎧 {L.audioOnly}</span>}
      {own && <span className={`rounded px-2 py-1 ${own.cls}`}>{own.text}</span>}
      {otherWeak && <span className="rounded bg-amber-500 px-2 py-1 text-black">{L.otherNetWeak}</span>}
    </span>
  )
}

const NOTICE_TEXT: Record<Exclude<CallNotice, null>, keyof VideoLabels> = {
  startedInAudio: 'startedInAudio',
  videoReduced: 'videoReduced',
  videoPaused: 'videoPaused',
  videoRestored: 'videoRestored',
  reconnected: 'reconnected',
  cameraUnavailable: 'cameraUnavailable',
}

function NoticeBox({ L, notice, audioOnly, onClose }: { L: VideoLabels; notice: CallNotice; audioOnly: boolean; onClose: () => void }) {
  if (!notice && !audioOnly) return null
  return (
    <div className="w-full max-w-md rounded-lg bg-black/75 px-3 py-2 text-center text-sm leading-relaxed" role="status" data-testid="call-notice">
      {notice ? (
        <p>
          {L[NOTICE_TEXT[notice]]}{' '}
          <button type="button" onClick={onClose} className="ms-1 underline">
            {L.close}
          </button>
        </p>
      ) : (
        <>
          <p className="font-semibold">{L.audioOnlyActive}</p>
          <p className="mt-1 text-xs text-gray-300">{L.audioOnlyNote}</p>
        </>
      )}
    </div>
  )
}

function CallButton({ children, active, disabled, onClick, testId }: { children: React.ReactNode; active: boolean; disabled?: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`min-h-[48px] rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${active ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
    >
      {children}
    </button>
  )
}

/** Marks the leave as intentional, then disconnects via the room context. */
function LeaveButton({ label, onClick }: { label: string; onClick: () => void }) {
  const room = useRoomContext()
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        void room.disconnect()
      }}
      className="min-h-[48px] rounded-full bg-red-600 px-5 text-sm font-semibold text-white"
    >
      📞 {label}
    </button>
  )
}
