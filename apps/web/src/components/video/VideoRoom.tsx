'use client'

/**
 * Shared call UI (patient + doctor), built on LiveKit's React primitives.
 * Mobile-first: remote participant fills the screen, own camera as a small
 * inset, large touch controls. The token/server URL come from our backend only.
 */
import { useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
import { ConnectionState, LocalVideoTrack, Track } from 'livekit-client'
import { VIDEO_LABELS, type VideoLang } from './labels'

export interface VideoRoomProps {
  serverUrl: string
  token: string
  lang: VideoLang
  audio: boolean
  video: boolean
  /** User pressed Leave (intentional). */
  onLeave: () => void
  /** Connection lost / failed (not user-initiated). */
  onDropped: (reason: string) => void
}

export function VideoRoom({ serverUrl, token, lang, audio, video, onLeave, onDropped }: VideoRoomProps) {
  // A ref (not state): onDisconnected fires before React re-renders after Leave
  const leavingRef = useRef(false)
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={audio}
      video={video}
      options={{ adaptiveStream: true, dynacast: true }}
      onDisconnected={() => (leavingRef.current ? onLeave() : onDropped('disconnected'))}
      onError={(e) => onDropped(e?.name ?? 'error')}
      className="relative flex h-full min-h-[70vh] w-full flex-col overflow-hidden rounded-lg bg-gray-950 text-white"
      data-lk-theme="none"
    >
      <CallStage lang={lang} onLeaveClick={() => (leavingRef.current = true)} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function CallStage({ lang, onLeaveClick }: { lang: VideoLang; onLeaveClick: () => void }) {
  const L = VIDEO_LABELS[lang]
  const state = useConnectionState()
  const remotes = useRemoteParticipants()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant()
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })
  const remoteCam = cameraTracks.find((t) => !t.participant.isLocal)
  const localCam = cameraTracks.find((t) => t.participant.isLocal)
  const [canSwitch, setCanSwitch] = useState(false)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices?.().then((d) => setCanSwitch(d.filter((x) => x.kind === 'videoinput').length > 1)).catch(() => undefined)
  }, [])

  const toggle = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch {
      /* permission or device error: the button simply keeps its state */
    } finally {
      setBusy(false)
    }
  }
  const switchCamera = () =>
    toggle(async () => {
      const next = facing === 'user' ? 'environment' : 'user'
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined
      await track?.restartTrack({ facingMode: next })
      setFacing(next)
    })

  const banner =
    state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting
      ? L.reconnecting
      : state === ConnectionState.Connecting
        ? L.connecting
        : null

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="relative flex-1 bg-black">
        {remoteCam && isTrackReference(remoteCam) && remoteCam.publication && !remoteCam.publication.isMuted ? (
          <VideoTrack trackRef={remoteCam} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-base text-gray-200">
            {remotes.length > 0 ? `${L.otherConnected} — ${L.cameraIsOff}` : L.waitingForOther}
          </div>
        )}
        <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs" data-testid="peer-status">
          {remotes.length > 0 ? `● ${L.otherConnected}` : `○ ${L.waitingForOther}`}
        </div>
        {banner && (
          <div className="absolute inset-x-0 top-12 mx-auto w-fit rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-black" role="status">
            {banner}
          </div>
        )}
        <div className="absolute bottom-3 right-3 h-36 w-24 overflow-hidden rounded-md border border-white/30 bg-gray-800 sm:h-40 sm:w-56">
          {localCam && isTrackReference(localCam) && isCameraEnabled ? (
            <VideoTrack trackRef={localCam} className="h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
          ) : (
            <div className="flex h-full items-center justify-center p-1 text-center text-xs text-gray-300">{L.you}: {L.cameraIsOff}</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 bg-gray-900 p-3" dir="ltr">
        <CallButton active={isMicrophoneEnabled} disabled={busy} onClick={() => toggle(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}>
          {isMicrophoneEnabled ? `🎙 ${L.mute}` : `🔇 ${L.unmute}`}
        </CallButton>
        <CallButton active={isCameraEnabled} disabled={busy} onClick={() => toggle(() => localParticipant.setCameraEnabled(!isCameraEnabled))}>
          {isCameraEnabled ? `📷 ${L.cameraOff}` : `🚫 ${L.cameraOn}`}
        </CallButton>
        {canSwitch && isCameraEnabled && (
          <CallButton active disabled={busy} onClick={switchCamera}>
            🔄 {L.switchCamera}
          </CallButton>
        )}
        <LeaveButton label={L.leave} onClick={onLeaveClick} />
      </div>
    </div>
  )
}

function CallButton({ children, active, disabled, onClick }: { children: React.ReactNode; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
