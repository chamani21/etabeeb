# eTabeeb V1 — Shared WhatsApp inbox, handover, patient files, recorded audio

Status: built and validated on **staging**; **not enabled in production**.

## What it does

Patients keep talking to the one eTabeeb WhatsApp number. Every message (patient,
bot, automatic, staff) is stored in a per-contact **conversation** that admin and
doctor work from inside their dashboards. Staff personal numbers are never shown to
the patient. No live WhatsApp calling.

A conversation is one WhatsApp **contact** — not a patient and not a case (a number
may book for several family members). A message is linked to a case only when that
is unambiguous (the contact's single open case); otherwise it shows
**“Case association needed”** and staff link it explicitly.

## Ownership and handover

| Owner | Who may message the patient | Bot replies |
|---|---|---|
| BOT | nobody (staff can still add internal notes) | yes |
| ADMIN | the admin who owns it (an unclaimed admin queue must be claimed first) | suppressed for this contact only |
| DOCTOR | the doctor who accepted | suppressed |

- **Take over** (admin): BOT → ADMIN. Queued bot replies for this contact are withdrawn.
- **Request doctor handover** (owning admin): internal summary + selected files (flagged
  for review). The admin **stays owner** while pending. No patient notice (the doctor
  has not joined).
- **Accept** (doctor) → DOCTOR; **Decline** (doctor, internal reason) and **Cancel
  request** (admin) leave the admin responsible.
- **Return to admin** (doctor, optional instruction note) → back to the admin who asked;
  the doctor loses send permission immediately.
- **Take back to admin** (any admin, audited).
- **Resume bot** (owner) — refused when the bot would have to ask the patient's name
  again; the bot only reacts to the next patient message (nothing restarts).
- Every change locks the conversation and checks its ownership **version**: a stale
  screen or a second tab gets “The conversation changed… reload” (HTTP 409).
- Queued (unsent) staff replies written under an older version are cancelled at the
  transition and re-checked at dispatch. A message already accepted by Meta cannot be
  recalled.

Patient notices (Pashto, at most one per transition, only inside the 24-hour window —
ownership changes work even when no notice can be sent):

| Transition | Text |
|---|---|
| BOT → ADMIN | ستاسو پیغام د eTabeeb همکار ته ورسېد. ستاسو پوښتنو ته به همدلته ځواب درکړل شي. |
| doctor accepted | اوس ډاکټر صاحب ستاسو خبرې اترې ګوري. خپلې پوښتنې همدلته ولیکئ. |
| DOCTOR → ADMIN / taken back | ستاسو خبرې اترې بېرته د eTabeeb همکار ته وسپارل شوې. همدلته به درسره اړیکه ونیول شي. |

## Where staff find it

- **Admin → Messages** (`/admin/inbox`) and **Doctor → Messages** (`/doctor/inbox`):
  filters Mine / Admin queue / Doctor queue / Pending handovers / All, unread counts,
  owner and handover badges, a nav badge (unread mine + handovers for me + admin queue).
- **Patient chat** card on each case page (same component).
- **Files** button in a conversation: patient files, “Flagged for review” filter,
  open/download original, label, case association, flag (admin), mark reviewed (doctor).
- Composer: **Message patient** vs **🔒 Internal note** (notes are a separate table and
  can never reach WhatsApp); photo/PDF; record → preview → **Send voice message**.

The doctor sees only conversations they own, were asked to take, or whose contact has a
case that reached the doctor (awaiting approval or later). Other ids answer 404.

## Messaging rules

- Free-form text/photo/PDF/voice only inside Meta's 24-hour customer-service window
  (provider timestamp of the patient's last message, 23.5 h margin), checked when
  queuing **and** at dispatch. Outside it the composer explains why.
- **Template gap:** there is no approved template that simply invites the patient to
  reply, so nothing is offered outside the window. Proposed (not submitted):
  `etabib_reply_invite_ps` (UTILITY, ps_AF) —
  “محترم/محترمه {{1}}، eTabeeb ستاسو د پیغام په اړه له تاسو سره اړیکه نیول غواړي. مهرباني وکړئ دې پیغام ته ځواب ورکړئ.”
- Double taps / retries: a client request key per draft (unique), and the existing
  outbox idempotency + atomic claim. A job handed to n8n with no result is shown as
  “Unknown — check before resending” after 10 minutes; it is never resent automatically.
- Delivery status shown from the existing outbox (sent → delivered → read, never
  regresses; no invented read receipts).

## Files and audio

- Inbound media: the webhook stores only Meta's media id + metadata, then (not awaited)
  asks n8n **eTabib - Media Intake** to download it with the WhatsApp credential and
  upload it to `POST /api/hooks/wa-media/<id>` (shared key). The app sniffs the real
  type (JPEG/PNG/WebP/PDF/OGG/MP3/M4A/AAC/AMR/MP4/3GP; never HTML/SVG/Office/executables),
  max 25 MB, stores it once under `inbox/<conversation>/<attachment>.<ext>` (no patient
  names in keys, URLs or headers). Unsupported types are shown, never fetched. Failures
  are visible with **Retry download**; the scheduler retries stuck requests.
- Staff files are streamed only to authorized staff (`private, no-store`, `nosniff`).
  WhatsApp fetches staff-sent files/voice notes through the existing short-lived HMAC
  media links; patient uploads are never public-linkable.
- Recorded audio: MediaRecorder (WebM/Opus or iPhone MP4/AAC) → FFmpeg → OGG/Opus mono
  48 kHz (original kept) → WhatsApp voice note. Nothing is sent until “Send voice message”.
- No OCR, transcription, AI analysis or automatic deletion.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ETABIB_INBOX_ENABLED` | off | `true` enables storage, bot suppression, pages and APIs |
| `ETABIB_N8N_MEDIA_URL` | unset | `https://n8n.kozhakclinic.com/webhook/etabib-media`; unset → files stay “waiting for download” |
| `ETABIB_GRAPH_VERSION` | `v21.0` | passed to Media Intake |

Storage: the existing private Docker volume (`/app/private-uploads`) — survives
container replacement. **It is not backed up today** (only DB dumps are taken manually);
add a daily backup of the uploads volume and the DB before production use.

## n8n (drafts — not published)

- **eTabib - Outbound Sender** (`MFhYkgipkTNtg7Lk`): draft adds INBOX_TEXT/AUDIO/IMAGE/
  DOCUMENT/NOTICE and a document branch. Live version unchanged until published.
- **eTabib - Media Intake** (`gzkjrFWT5wYHjrCa`, inactive): draft binds
  “eTabib Staging - WhatsApp API”, validates the job (upload URL must be the app's own
  hook for that attachment), only downloads from `lookaside.fbsbx.com` (no redirects,
  ≤ 25 MB), failure → `upload_url/failed`.
- Backups: `/opt/kozhak/etabeeb-v1-prod/backups/n8n-pre-inbox-20261008T090605Z/`.

## Enabling in production (later, explicitly)

1. DB backup; deploy the image; run migration 0008 (additive; imports history labelled
   “content not recorded before the inbox was enabled”).
2. Publish the Outbound Sender draft; publish/activate Media Intake.
3. Set `ETABIB_INBOX_ENABLED=true` and `ETABIB_N8N_MEDIA_URL` in the production `.env`;
   recreate the web container.
4. Test with an authorized pilot number only.

## Rollback

- Set `ETABIB_INBOX_ENABLED=false` (or remove it) and recreate the web container:
  behaviour returns to the pre-inbox bot exactly; the new tables stay (unused).
- n8n: restore the previous Outbound Sender version (`2938e909`) if the draft was
  published; deactivate Media Intake only if it was activated for this feature.
- The migration is additive; no down-migration is needed.
