# eTabib V1 — Backend Foundation (Phases 2–4)

Simplified telemedicine workflow for Kozhak Specialist Clinic. **One fixed doctor (Dr. Jalaluddin)**, WhatsApp intake that collects **only the patient name and phone** (Pashto), clinical intake by an admin, **manual** payment confirmation, and **manual** doctor time approval.

No doctor selection, no slot marketplace or booking engine, no appointment holds, no payment gateway or Easypaisa API, and no AI triage.

---

## 1. Architecture

```
Meta WhatsApp ─► n8n (forwarder) ─► POST /api/hooks/whatsapp ─┐
                                                              │   apps/web/src/lib/etabib/
Admin UI ─► POST /api/admin/cases/:id/* ──────────────────────┼─► cases.ts / whatsapp.ts
Doctor UI ─► POST /api/doctor/cases/:id/* ────────────────────┘        │
                                                                       ▼
                                                     transitions.ts (ONLY status writer)
                                                       │ lock row → guard → update → case_events
                                                       ▼
                                   outbound.ts → notification_outbox (same transaction)
                                       │ after commit
                                       ▼
                    ETABIB_N8N_OUTBOUND_URL ("eTabib - Outbound Sender", n8n)
                                       │ delivery result
                                       ▼
                         POST /api/hooks/outbound-result
```

| Module (`apps/web/src/lib/etabib/`) | Responsibility |
|---|---|
| `transitions.ts` | The state machine. It's the **only** code allowed to change `consultation_cases.status`. Also creates cases and appends `case_events`. |
| `cases.ts` | Admin, doctor and integration actions (intake, payment, approval request, decision, start, prescription, outbound result). One DB transaction per action. |
| `whatsapp.ts` | Parses the forwarded Meta webhook and runs the deterministic name and phone intake. |
| `outbound.ts` | Central outbound integration: enqueues jobs into the existing `notification_outbox` and dispatches them to n8n. |
| `messages.ps.ts` | **All** patient-facing text (Pashto only). |
| `auth.ts` | `requireAdmin`, `requireV1Doctor`, `requireHookKey`. |
| `schemas.ts` | Zod validation for every route. |
| `phone.ts`, `sanitize.ts`, `errors.ts`, `config.ts` | Phone normalization, redaction, safe error responses, env access. |

**Reused from the existing app:**
- NextAuth sessions and roles (`administrator`, `practitioner`) via `lib/auth-helpers.ts`
- The Drizzle and Postgres client in `@etabeeb/db`
- Zod and the `{ error }` response conventions
- The `notification_outbox` transactional outbox
- The `prescriptions` and `prescription_items` tables, with insert logic extracted to `lib/prescriptions.ts` and shared with `POST /api/prescriptions`

The appointment/slot model (`appointments`, `appointment_holds`, `payments`) is **not used** by V1 because its semantics (slots, holds, gateway states) conflict with the simplified workflow.

## 2. Consultation states

`NEW → ADMIN_INTAKE → INTAKE_COMPLETE → AWAITING_PAYMENT → PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL → CONFIRMED → IN_CONSULTATION → PRESCRIPTION_SENT → COMPLETED`

Exactly these ten statuses exist (`consultation_status` PG enum). No extra workflow states were added.

## 3. Allowed transitions

The lifecycle is **strictly linear**: each status has exactly one successor (`NEXT_STATUS` in `transitions.ts`). Anything else throws `TransitionError('illegal_transition')` and the API returns HTTP 409. For example, all of these fail: `NEW→CONFIRMED`, `ADMIN_INTAKE→PAYMENT_RECEIVED`, `AWAITING_PAYMENT→CONFIRMED`, `CONFIRMED→PAYMENT_RECEIVED`, `COMPLETED→IN_CONSULTATION`.

| Transition | Event written |
|---|---|
| NEW → ADMIN_INTAKE | `ADMIN_INTAKE_REQUESTED` |
| ADMIN_INTAKE → INTAKE_COMPLETE | `ADMIN_INTAKE_COMPLETED` |
| INTAKE_COMPLETE → AWAITING_PAYMENT | `PAYMENT_REQUESTED` |
| AWAITING_PAYMENT → PAYMENT_RECEIVED | `PAYMENT_CONFIRMED` |
| PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL | `DOCTOR_APPROVAL_REQUESTED` |
| AWAITING_DOCTOR_APPROVAL → CONFIRMED | `CONSULTATION_CONFIRMED` |
| CONFIRMED → IN_CONSULTATION | `CONSULTATION_STARTED` |
| IN_CONSULTATION → PRESCRIPTION_SENT | `PRESCRIPTION_SENT` |
| PRESCRIPTION_SENT → COMPLETED | `CASE_COMPLETED` |

These events are written without a status change: `CASE_CREATED`, `PATIENT_NAME_RECEIVED`, `PATIENT_PHONE_RECEIVED`, `ADMIN_INTAKE_UPDATED`, `DOCTOR_APPROVED`, `DOCTOR_PROPOSED_NEW_TIME`, `DOCTOR_POSTPONED`, `DOCTOR_REJECTED`, `PRESCRIPTION_CREATED`, `PRESCRIPTION_DELIVERY_FAILED`. A `DOCTOR_APPROVAL_REQUESTED` event is also written without a status change when approval is re-requested with a new time.

## 4. Transition guards

Guards are evaluated against the case **as it would be after the patch**:

| Target | Guard |
|---|---|
| ADMIN_INTAKE | `patientName` and `patientPhone` present |
| INTAKE_COMPLETE / AWAITING_PAYMENT | `age`, `sex`, `consultationFor`, `location`, `mainComplaint` present |
| PAYMENT_RECEIVED | `paymentReceived = true`, `paymentConfirmedAt` and `paymentConfirmedBy` present |
| AWAITING_DOCTOR_APPROVAL | `paymentReceived = true`, `proposedConsultationTime` present |
| CONFIRMED | `paymentReceived = true`, `paymentConfirmedAt` present, `doctorDecision = APPROVED`, `doctorApprovedTime` present |
| IN_CONSULTATION | current status is CONFIRMED (enforced by linearity) |
| PRESCRIPTION_SENT | `prescriptionId` present, `prescriptionSentAt` present, **and** delivery evidence (the id of an outbound `PRESCRIPTION_READY` job that n8n confirmed with a WhatsApp message id) |
| COMPLETED | current status is PRESCRIPTION_SENT |

**Database backstop:** the CHECK constraint `consultation_cases_confirmed_guard_check` makes CONFIRMED and every later status impossible without manual payment confirmation (`paymentReceived` true, plus who confirmed it and when) and an explicit doctor approval with an approved time. This holds even for raw SQL.

### Transactions and concurrency

`transitionCase(tx, …)` always runs inside a caller-supplied `db.transaction` and does the following:

1. `SELECT … FOR UPDATE` on the case row (pessimistic lock)
2. Checks the current status, and the expected source status if one is given
3. Checks that the target is the single allowed successor
4. Checks the guards
5. Runs `UPDATE … WHERE id = ? AND status = <locked status>` (a second, optimistic check)
6. Inserts the `case_events` row

Any failure rolls back the whole transaction, so a status change can never commit without its event.

Concurrent requests on one case are serialized by the row lock. Tests verify that exactly one of four concurrent identical transitions succeeds.

## 5. Database entities

Defined in `packages/db/src/schema/etabib.ts` and created by migration `0001_etabib_v1_consultation.sql`.

- **`consultation_cases`**
  - **Columns:** `id`, `status`, `whatsapp_phone` (WhatsApp sender, used for lookup), `patient_name`, `patient_phone`, `age`, `sex` (MALE, FEMALE), `consultation_for` (SELF, OTHER), `location`, `main_complaint`, `medical_history`
  - **Payment columns:** `payment_received`, `payment_source` (EASYPAISA, OTHER), `payment_reference`, `payment_amount` (whole PKR, integer), `payment_confirmed_by` (FK to `users`), `payment_confirmed_at`
  - **Doctor and consultation columns:** `proposed_consultation_time`, `doctor_decision` (PENDING, APPROVED, PROPOSE_NEW_TIME, POSTPONED, REJECTED), `doctor_approved_time`, `doctor_decision_at`, `consultation_link`
  - **Prescription and time columns:** `prescription_id` (FK to `prescriptions`, unique), `prescription_sent_at`, `created_at`, `updated_at`
  - **Indexes:** `status`, `patient_phone`, `created_at`, a partial unique index on `whatsapp_phone WHERE status <> 'COMPLETED'` (one open case per sender), and a unique index on `prescription_id`
  - **CHECK constraints:** age range, non-negative amount, and the confirmed-guard backstop
  - No doctor column: Dr. Jalaluddin is fixed and is identified by `ETABIB_V1_DOCTOR_USER_ID` at the API layer
- **`case_events`** (append-only): `id`, `consultation_id` (FK, restrict), `event_type` (text validated in app code, so new types need no migration), `old_status`, `new_status`, `actor_type` (SYSTEM, PATIENT, ADMIN, DOCTOR, N8N), `actor_id`, `metadata` (jsonb; ids and flags only, **no PHI or secrets**), `created_at`. Indexed on (`consultation_id`, `created_at`). A trigger `case_events_immutable` rejects UPDATE and DELETE.
- **`whatsapp_events`**: `id`, `wamid` (**UNIQUE**), `sender_phone`, `event_type` (the Meta message type), `consultation_id`, `processed_at`, `created_at`.
- **`integration_errors`**: sanitized n8n error reports, unique on (`source`, `execution_id`, `node`).

**Changed existing table:** `prescriptions.encounter_id`, `appointment_id` and `prescribed_for_user_id` are now **nullable**. This is non-destructive. V1 prescriptions have no appointment or encounter, and the WhatsApp patient has no user account. The legacy `POST /api/prescriptions` still requires all three.

## 6. WhatsApp intake (`POST /api/hooks/whatsapp`)

The handler is deterministic and uses no AI. For each inbound message it runs **one transaction**:

1. Inserts `whatsapp_events(wamid)` with `ON CONFLICT DO NOTHING`.
   - If the row already exists, the message is a duplicate. The handler returns 200 `{duplicate: true}` and does nothing else.
   - Because the insert sits in the same transaction as the processing, concurrent duplicates block on the unique index and then become no-ops.
   - A processing failure rolls the ledger row back, so Meta's retry is processed normally.
2. Takes `pg_advisory_xact_lock(sender)`, which serializes one sender's messages so name and phone are applied in order.
3. Finds the open (non-COMPLETED) case for the sender, or creates one in `NEW` (`CASE_CREATED`), then acts on its state:

| Case state | Message | Action |
|---|---|---|
| none | any | Create the case and queue the Pashto **ask-name** message |
| NEW, no name | valid name (letters, 2–80 characters, no digits or URLs) | Save the name (`PATIENT_NAME_RECEIVED`) and queue **ask-phone** |
| NEW, no name | invalid or media | Re-ask the name |
| NEW, name set | valid phone (PK `03…`, AF `07…`, `+92`, `+93`, `00…`, Pashto digits) | Save it as E.164 (`PATIENT_PHONE_RECEIVED`), move **NEW → ADMIN_INTAKE**, queue `ADMIN_NEW_CASE` and the patient acknowledgement |
| NEW, name set | invalid | Re-ask the phone |
| ADMIN_INTAKE or later | any | **No questions and no restart.** Queue at most one "case in progress" message per stage |

The bot never asks for age, sex, symptoms, complaint, history, location or payment. Status-only webhooks are acknowledged and ignored.

## 7. Admin intake (`POST /api/admin/cases/:id/intake`)

- **Input:** `age`, `sex`, `consultationFor`, `location`, `mainComplaint`, optional `medicalHistory`, and optional corrections `patientName` and `patientPhone`.
- **From ADMIN_INTAKE:** moves → INTAKE_COMPLETE → AWAITING_PAYMENT in **one transaction** (two guarded transitions).
- **From INTAKE_COMPLETE:** moves → AWAITING_PAYMENT.
- **In AWAITING_PAYMENT:** updates the fields (`ADMIN_INTAKE_UPDATED`). An identical resubmission is a no-op.
- **Any other status:** returns 409.

## 8. Payment (`POST /api/admin/cases/:id/payment`)

- **Input:** `received`, `source` (EASYPAISA or OTHER), optional `reference` and `amount`.
- The schema is `.strict()`: a client-supplied `paymentConfirmedBy` or `paymentConfirmedAt` returns 400.
- The server sets `paymentConfirmedBy` from the admin session and `paymentConfirmedAt` from server time.
- `received: true` in AWAITING_PAYMENT moves the case → PAYMENT_RECEIVED (`PAYMENT_CONFIRMED`).
- Repeats and double-clicks return `changed: false` and never overwrite who confirmed the payment, when, or the amount.
- No gateway, Easypaisa API or reconciliation is involved.

## 9. Doctor approval

**`POST /api/admin/cases/:id/request-doctor-approval`** (admin), input `proposedConsultationTime` (a future ISO date-time):
- Requires payment. Moves PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL and queues `DOCTOR_APPROVAL_REQUEST`.
- That job's payload carries: consultation id, patient name, age, sex, location, short complaint and proposed time. Nothing clinical goes into URLs.
- Re-requesting with a new time while still awaiting approval updates the time and queues a new job. Retrying the same time is a no-op.

**`POST /api/doctor/cases/:id/decision`** (only the configured V1 doctor):

| decision | Effect |
|---|---|
| `APPROVED` + `approvedTime` (required) + optional `consultationLink` (https) | Writes `DOCTOR_APPROVED`, then the guarded move → **CONFIRMED** (`CONSULTATION_CONFIRMED`), and queues `CONSULTATION_CONFIRMED_PATIENT` (Pashto, with time and link) and `CONSULTATION_CONFIRMED_DOCTOR`. A retry with the same time is a no-op. A different time after confirmation returns 409. |
| `PROPOSE_NEW_TIME` + `proposedTime` | Stores the counter-proposal as `proposedConsultationTime`. **Not confirmed.** |
| `POSTPONED` | Records the event. Not confirmed. |
| `REJECTED` | Records the event. Not confirmed. |

The case stays in AWAITING_DOCTOR_APPROVAL for PROPOSE_NEW_TIME, POSTPONED and REJECTED. The admin coordinates with the patient and re-requests approval. No rescheduling engine exists.

**Consultation link:** the existing LiveKit room and token route (`/api/video/token`) is bound to `appointments` and was left untouched. In V1 the doctor or admin supplies an https link on approval, and it's stored in `consultation_link` and included in both confirmation jobs. If no link is given, the patient message says the link will follow. See Phase 5 for the remaining work.

## 10. Consultation start (`POST /api/doctor/cases/:id/start`)

Moves CONFIRMED → IN_CONSULTATION (`CONSULTATION_STARTED`). Calling it again while IN_CONSULTATION returns 200 with `changed: false`.

## 11. Prescription flow

1. **`POST /api/doctor/cases/:id/prescription`** (V1 doctor, case IN_CONSULTATION), input `items[]` (the existing prescription item schema):
   - Creates and signs the prescription through the **existing** prescription module (`insertPrescription`), links `consultation_cases.prescription_id` (`PRESCRIPTION_CREATED`) and queues `PRESCRIPTION_READY`.
   - A second prescription for the same case returns 409.
2. n8n sends the prescription. The dispatch payload includes the prescription number, verification token and structured items. There's no PDF renderer in the repository yet (only a `pdf_key` column).
3. n8n calls `/api/hooks/outbound-result`. When it reports success **with the WhatsApp message id** (`wamid`) from Meta, the case moves IN_CONSULTATION → PRESCRIPTION_SENT → COMPLETED in one transaction.
   - Queueing alone, or a success report without a `wamid`, never marks the prescription sent.
   - A failure records `PRESCRIPTION_DELIVERY_FAILED`, and a later successful retry still completes the case.

## 12. n8n hook contracts

Every hook requires the header `x-etabib-key: <ETABIB_HOOK_KEY>`. A missing or wrong key, or an unconfigured key, returns **401**. Hooks are exempt from the NextAuth cookie gate in `middleware.ts` because the shared key is their authentication.

**`POST /api/hooks/whatsapp`**
- **Body:** the Meta webhook body as received (`{object, entry[].changes[].value.messages[]}`). The `value` object alone, or n8n's `{ body: … }` wrapper, is also accepted.
- **Response 200:** `{ success, processed, results: [{ wamid, duplicate, outcome, consultationId, status, jobs: [{id, type}] }] }`
- **Errors:** 400 for malformed JSON, 401 for a bad key, 500 (generic) for a processing failure. Meta or n8n should retry on 500, and the retry is safe.

**`POST /api/hooks/outbound-result`**
- **Body:**

```json
{ "jobId": "<uuid from the outbound payload>", "idempotencyKey": "<alternative to jobId>",
  "consultationId": "<optional, must match>", "success": true,
  "status": "sent | delivered | read | failed", "wamid": "<Meta message id>",
  "error": { "code": "…", "message": "…" } }
```

- **Response 200:** `{ success, jobId, type, changed, jobStatus, consultationId, consultationStatus }`
- **Errors:** 404 for an unknown job, 400 for a consultation mismatch or invalid body.
- **Idempotency:** a repeat is a no-op, a job's status only moves forward (sent → delivered → read), and a late failure never regresses a successful job. Unknown keys are stripped, and the error text is redacted and truncated.

**`POST /api/hooks/n8n-error`**
- **Body:** `{ workflowName, workflowId?, node?, executionId?, timestamp?, errorMessage? }`. Every other key is stripped.
- The message is redacted (tokens, phones, e-mails, URL queries, opaque strings) and truncated to 500 characters, then stored in `integration_errors` and written as one sanitized log line.
- It's idempotent per (`executionId`, `node`).

**Outbound (app → n8n):**
- **Request:** `POST ETABIB_N8N_OUTBOUND_URL` with header `x-etabib-key: <ETABIB_N8N_OUTBOUND_KEY>` and this body:

```json
{ "jobId": "uuid", "idempotencyKey": "etabib:<TYPE>:<key>", "type": "<TYPE>",
  "audience": "PATIENT | ADMIN | DOCTOR", "consultationId": "uuid",
  "to": "+92… (resolved by the app)", "text": "<Pashto for patients, English notice for staff>",
  "data": { … }, "callback": { "path": "/api/hooks/outbound-result" } }
```

- **Job types:** `ADMIN_NEW_CASE`, `ASK_PATIENT_NAME`, `ASK_PATIENT_PHONE`, `PATIENT_ACKNOWLEDGED`, `PATIENT_CASE_IN_PROGRESS`, `DOCTOR_APPROVAL_REQUEST`, `CONSULTATION_CONFIRMED_PATIENT`, `CONSULTATION_CONFIRMED_DOCTOR`, `PRESCRIPTION_READY`.
- **Recipients:** the app resolves every recipient (patient number, `ETABIB_ADMIN_WHATSAPP`, `ETABIB_DOCTOR_WHATSAPP`) and sends `to` + `text` for every job. Staff `text` is a short English notice. See `ETABIB_V1_N8N_INTEGRATION.md`.
- **Dedupe:** n8n must use `idempotencyKey` to avoid double sends.
- **Storage and dispatch:** jobs are stored in `notification_outbox` with references only (no clinical text). The full payload is built at dispatch time. Each job is claimed atomically (pending → processing), so it can't be dispatched twice.
- If the outbound URL is unset or n8n rejects the request, the job stays `pending` with `attempts` and `last_error` set.

## 13. Environment variables (names only)

| Name | Purpose |
|---|---|
| `ETABIB_HOOK_KEY` | n8n → app shared key (`x-etabib-key`). Hooks fail closed if it's unset. |
| `ETABIB_N8N_OUTBOUND_URL` | app → n8n Outbound Sender webhook URL |
| `ETABIB_N8N_OUTBOUND_KEY` | app → n8n shared key (`x-etabib-key`) |
| `ETABIB_V1_DOCTOR_USER_ID` | `users.id` of Dr. Jalaluddin. Doctor routes fail closed if it's unset. |
| `NEXT_PUBLIC_APP_URL` | existing |
| `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | existing |
| `ETABIB_TEST_DATABASE_URL` | tests only: a **disposable** DB whose name contains `test`, wiped by each test run |

Placeholders are in `.env.example`. Never commit real values.

## 14. Security model

- **Admin routes:** NextAuth session with the `administrator` role.
- **Doctor routes:** NextAuth session with the `practitioner` role **and** `user.id === ETABIB_V1_DOCTOR_USER_ID`. The confirmer and decision identity come from the session, never from the request body.
- **Hooks:** constant-time comparison of `x-etabib-key` against `ETABIB_HOOK_KEY`. The header is never logged.
- **Validation:** strict Zod schemas cover UUID params, enums, phone numbers, ISO date-times, amounts and required fields. Bodies over 64 KB (256 KB for the WhatsApp hook) are rejected.
- **Errors:** external responses are generic (`{error, code}`). Server logs record only the error name and message, never request bodies, headers, phone numbers or clinical text.
- **No PHI in `case_events.metadata` or `notification_outbox.template_variables`.** Clinical content is only sent to n8n over HTTPS at dispatch time.
- **Idempotency is enforced at the database level:**
  - unique `wamid`
  - partial unique index for one open case per sender
  - unique outbox `idempotency_key`
  - unique `prescription_id`
  - row locks and status predicates on every transition

## 15. Testing

Tests use synthetic data only.

```bash
# disposable local database (name must contain "test"; it is dropped and rebuilt)
createdb etabeeb_test
ETABIB_TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/etabeeb_test npm test
```

| Suite | Covers |
|---|---|
| `apps/web/src/lib/etabib/__tests__/transitions.test.ts` | Pure state machine and guards |
| `apps/web/src/lib/etabib/__tests__/intake-utils.test.ts` | Phone, name, webhook parsing, redaction, Pashto-only messages |
| `apps/web/test/etabib.db.test.ts` | Model, constraints, triggers, guarded transitions, rollback, concurrency, idempotency (real PostgreSQL) |
| `apps/web/test/etabib.api.test.ts` | Route auth (401/403), shared key, patient flow, full lifecycle over HTTP, hooks, outbound dispatch |

Without `ETABIB_TEST_DATABASE_URL`, the DB suites are skipped and the unit suites still run.

**Migrations:** `npm run db:generate` (drizzle-kit) and `npm run db:migrate`.
- `0000_baseline.sql` is the pre-V1 schema, generated because no migrations had existed before.
- `0001_etabib_v1_consultation.sql` contains the V1 changes. Its hand-added section holds the CHECK constraints and the trigger, which drizzle-kit 0.24 does not emit.
- **Existing databases created with `db:push`:** apply only `0001` (it's idempotent) or record `0000` as applied. Running `0000` against them would fail because the objects already exist.

## 16. Remaining for Phase 5 (superseded — see `ETABIB_V1_N8N_INTEGRATION.md`)

- Build and repair the retained n8n workflows:
  - forwarder → `/api/hooks/whatsapp`
  - Outbound Sender: honour `idempotencyKey`, map `audience` to the admin or doctor numbers, send `text`, render or attach the prescription, call `/api/hooks/outbound-result` with the Meta `wamid`
  - Error Trigger → `/api/hooks/n8n-error`
- Add a periodic re-dispatch of `pending` outbox jobs (jobs are retained, but no retry worker exists yet).
- Decide how to deliver the prescription document: a PDF renderer (no generator exists yet) or a signed, short-lived fetch endpoint.
- Optionally use Meta `delivered` status webhooks as an even stronger delivery signal.
- Decide on the consultation-link strategy for V1 cases: reuse LiveKit by linking `consultation_rooms` to cases, or keep externally supplied links.
- Add admin and doctor UI screens for these endpoints.
- Configure the environment variables above in each environment and set `ETABIB_V1_DOCTOR_USER_ID`.
- Handle REJECTED cases (they stay in AWAITING_DOCTOR_APPROVAL) as an operational process.
