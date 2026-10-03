# eTabib V1 — P1 production hardening

Staging-validated additions on top of the Phase 5/6 backend. The state machine, outbox,
idempotency and n8n transport are unchanged; every new action goes through `cases.ts`.

## Inbound control (backend-enforced)

| Variable | Values | Default |
|---|---|---|
| `ETABIB_WHATSAPP_INBOUND_ENABLED` | `true` / anything else = off | off |
| `ETABIB_INBOUND_MODE` | `disabled` \| `allowlist` \| `public` | `allowlist` (unrecognised → `disabled`) |

Gate (in `lib/etabib/inbound-policy.ts`, same transaction as the wamid ledger):
kill switch/disabled → **staff** (configured admin/doctor numbers, active `STAFF`
allow-list entries, active users with `administrator`/`practitioner` role) → **blocked**
→ public / allow-list (`PATIENT_TEST`, `PILOT_PATIENT`). Ignored messages get a 200,
create no case, no state change and no outbox job; `whatsapp_events.disposition`
records why. In allowlist mode a deactivated number can neither start nor continue an
intake. Changing the mode is a server-config change (not stored in the DB), so it is not
an audited UI action.

## Staff UI (existing Next.js app, server-gated layouts + server-side API checks)

- Admin: `/admin/cases` (queue, filters, search), `/admin/cases/[id]` (intake/edit,
  payment, approval request/re-request, notes, audit trail, outbox + retry of failed
  messages), `/admin/senders` (allow-list), `/admin/staff` (reset links), `/admin/status`.
- Doctor (only `ETABIB_V1_DOCTOR_USER_ID`): `/doctor/cases`, `/doctor/cases/[id]`
  (approve / postpone / propose time, start, prescription editor with preview).
- Both: `/account/password`. Public: `/reset-password` (token in URL fragment).
- Public registration (`/register`, `POST /api/auth/register`) is disabled.

## Authentication

- bcrypt cost 12; 12–128 characters; common/trivial/identity-based passwords rejected.
- `users.session_version` is re-checked on every server-side session read; a password
  change or completed reset bumps it and revokes all sessions. Disabled accounts are revoked.
- `users.must_change_password` blocks every admin/doctor API (403
  `password_change_required`) until the password is changed.
- Reset: admin creates a one-time link (32 random bytes, SHA-256 stored, 30 min, single
  use, older links voided). The link is shown once to the admin; never logged or e-mailed.

## Audit

Case actions → `case_events` (append-only), now including `ADMIN_NOTES_UPDATED` and
`OUTBOX_RETRY_REQUESTED`. Non-case staff actions → `staff_audit_events` (append-only
trigger): password changed/rejected, reset requested/completed/rejected, allow-list
created/updated. Metadata never contains passwords, tokens or full phone numbers.

## Outbound contract additions

`messageKind: 'text' | 'template'`, `template` (strict, see
`ETABIB_V1_WHATSAPP_TEMPLATES.md`). The prescription text is now built by the backend
(Pashto headings + doctor content) and sent with `data.prescription.textComplete = true`;
n8n no longer receives the medicine list separately.
