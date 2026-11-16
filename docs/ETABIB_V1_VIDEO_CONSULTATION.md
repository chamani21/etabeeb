# eTabib V1 — video consultation (Phase 6.6)

LiveKit transports audio/video. The consultation case stays the clinical state
machine; the video session only tracks the room's operational lifecycle.

## Flow

1. Doctor approves → case `CONFIRMED`. **In the same transaction** a
   `consultation_video_sessions` row is created (one per case, random room name
   `etb-<32 hex>`, no case id/name/phone). Unpaid / unapproved cases cannot get one.
2. The patient confirmation message (`CONSULTATION_CONFIRMED_PATIENT`) is built at
   dispatch time with a fresh link `https://<app>/consult/<token>`:
   32 random bytes (base64url); only SHA-256 stored in `consultation_join_tokens`;
   expires `scheduled + ETABIB_VIDEO_LINK_TTL_HOURS`; older links are revoked.
3. The patient page (`/consult/[token]`, Pashto, no login) posts the token to
   `POST /api/video/patient/access` (status + doctor name + time) and
   `POST /api/video/patient/token` (LiveKit JWT). The token never goes in a query string.
4. The doctor joins from the dashboard: `POST /api/doctor/cases/[id]/video/token`
   (authenticated V1 doctor only).
5. "Start consultation" remains the only `CONFIRMED → IN_CONSULTATION` transition —
   joining the room never changes the case status.
6. When the case reaches `COMPLETED`, the session becomes `ENDED`, every link is
   revoked, no new tokens are issued and the LiveKit room is deleted (after commit).

## LiveKit tokens

`roomJoin` for exactly the case's room, `canPublish`/`canSubscribe`, no data,
no `roomAdmin`/`roomList`/`roomCreate`/`recorder`. TTL 15 minutes (an active call is
not cut off; a rejoin fetches a new token). Identities: `patient-<session8>`,
`doctor-<user8>`. The room name is always resolved server-side.

## Join windows (configurable)

| Who | From | Until |
|---|---|---|
| Patient | scheduled − `ETABIB_VIDEO_JOIN_EARLY_MINUTES` (15) | scheduled + `ETABIB_VIDEO_JOIN_LATE_MINUTES` (120) while `CONFIRMED`; while `IN_CONSULTATION` until completion (link lifetime cap) |
| Doctor | scheduled − `ETABIB_VIDEO_DOCTOR_EARLY_MINUTES` (60) | while `CONFIRMED`/`IN_CONSULTATION` |

A time change is only possible **before** confirmation (no session exists yet), so a
stale link can never point at an old time. After confirmation the time is fixed by
the state machine; if it must change, the admin revokes and re-sends the link.

## Admin

Case page → **Video session**: scheduled time, status, links generated/active,
expiry, last use, link-message delivery state (sent/delivered/read/failed), patient
and doctor join times, ended. **Revoke link & send a new one** is audited
(`VIDEO_LINK_REVOKED` + `VIDEO_LINK_CREATED`); a repeat within 60 s is a no-op.
Admins cannot obtain room tokens.

## Audit events (case_events, metadata never contains tokens or URLs)

`VIDEO_SESSION_CREATED`, `VIDEO_LINK_CREATED`, `VIDEO_LINK_REVOKED`,
`PATIENT_VIDEO_JOINED/LEFT`, `DOCTOR_VIDEO_JOINED/LEFT` (from signed LiveKit
webhooks; metadata: LiveKit event id and participant sid), `VIDEO_SESSION_ENDED`,
`VIDEO_JOIN_NOTICE_QUEUED/SKIPPED` (room-join notices, with the reason when skipped).

## Room-join notices (WhatsApp)

Doctor enters the room → the patient gets a Pashto WhatsApp notice with their
consultation link; patient enters → the doctor gets one on `ETABIB_DOCTOR_WHATSAPP`
with the dashboard case link (login required). Code: `lib/etabib/video-webhook.ts`,
`video-join.ts`, outbox types `VIDEO_DOCTOR_JOINED_PATIENT` / `VIDEO_PATIENT_JOINED_DOCTOR`.

- **Trigger:** only a signed LiveKit `participant_joined` (never room creation, page
  opens, token requests or failed connections) for a CONFIRMED / IN_CONSULTATION case.
- **Who counts:** the identity the server issued for this room (`patient-<session>` /
  `doctor-<V1 doctor>`) **and** the role in the server-signed token metadata, and a
  standard participant (agents, recorders, SIP ignored). Prefix-only identities are audited but never notify.
- **Once:** one decision per role per consultation (queued or skipped). Reconnects,
  refreshes and LiveKit retries (same event id → ignored) send nothing more. Webhooks of
  a room are serialized (case → session row lock). Exception: a notice withdrawn because
  the joiner left before it could go out (`joined_party_left`, e.g. the doctor peeked in
  early) is re-armed, so the next real join still notifies the other side (max 5 per role).
- **No needless message:** skipped if the recipient is already in the room; at dispatch
  it is re-checked (recipient joined meanwhile, the person who joined left, case closed
  → withdrawn). Cancelling a case withdraws a queued notice.
- **Doctor early:** doctors may enter 60 min early but the patient link opens 15 min
  before; the notice then waits (`waiting_for_patient_join_window`, not an attempt) and
  goes out with the scheduler (every 5 min) once the link works.
- **Patient link:** minted at dispatch with the same session, expiry and restrictions as
  the confirmation link, which keeps working. A link minted by a failed attempt of the
  same job is revoked on retry. The token never appears in audit metadata or the inbox history.
- **WhatsApp rules:** text inside the recipient's 24-hour window; otherwise the approved
  template (`etabib_doctor_joined_ps` / `etabib_patient_joined_ps`), and if it is not
  configured the job fails as `template_required` instead of a non-compliant send.
- **Never blocking:** the webhook answers after the DB commit; dispatch runs afterwards
  and failures stay in the outbox (retried by the scheduler, visible to the admin).
- Stale webhooks (> 5 min old, e.g. a retry backlog) are audited but never notify.

## LiveKit setup (per environment)

1. Create a LiveKit project (LiveKit Cloud or self-hosted).
2. Set `LIVEKIT_URL` (wss://…), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in the server
   env (staging helper: `/root/etabeeb-v1-set-livekit.sh`, hidden input).
3. Webhook: `https://<app>/api/hooks/livekit` (alias of `/api/video/livekit-webhook`), signed with the same API key
   (records join/leave). Without it calls work but join/leave audit events are missing.

## WhatsApp delivery receipts

`POST /api/hooks/whatsapp` now also processes `statuses[]` (sent/delivered/read/failed),
correlated to the outbox by Meta message id; never creates cases. A `failed`
receipt after acceptance marks the job failed with Meta's reason. Receipts reach the
app only while the n8n "WhatsApp Inbound" workflow is active.
