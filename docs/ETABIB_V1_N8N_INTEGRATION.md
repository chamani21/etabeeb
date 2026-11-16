# eTabib V1 — n8n integration (Phase 5)

n8n is **transport only**. The app owns state, recipients, language, idempotency and
every status transition. No secret value appears in this document or in any workflow.

## 1. Architecture

```
Meta ──► n8n "WhatsApp Inbound" ──► app  GET/POST /api/hooks/whatsapp
App  ──► n8n "Outbound Sender"  ──► Meta Graph ──► app POST /api/hooks/outbound-result
App  ◄── n8n "Scheduler" (5 min) ── POST /api/hooks/outbox-dispatch   (re-push pending jobs)
Any eTabib workflow failure ──► n8n "Error Monitor" ──► app POST /api/hooks/n8n-error
```

The outbox is **push** (the app POSTs jobs to n8n right after commit). The Scheduler does not
poll a database; it asks the app to re-push `pending` jobs. n8n never connects to PostgreSQL.

## 2. Workflows (IDs unchanged, all INACTIVE)

| Workflow | ID | Webhook path | Status |
|---|---|---|---|
| eTabib - WhatsApp Inbound | `PPUsKLUcy826TJ14` | `GET`/`POST /etabib-wa` | retained, repaired |
| eTabib - Outbound Sender | `MFhYkgipkTNtg7Lk` | `POST /etabib-outbound` | retained, rebuilt around the real contract |
| eTabib - Error Monitor | `8fj0f1ERv6WQf9YR` | — (Error Trigger) | retained, contract fixed |
| eTabib - Scheduler | `BBPIiFByZglPqwFv` | — (every 5 min) | retained, retargeted to outbox re-dispatch only |
| eTabib - Media Intake | `gzkjrFWT5wYHjrCa` | `POST /etabib-media` | **untouched, inactive, not needed in V1** (no `/media-failed` route exists) |

## 3. Backend hook contracts (all require `x-etabib-key`)

- `GET /api/hooks/whatsapp` — Meta verification relayed by n8n. 200 + challenge text when
  `hub.mode=subscribe` and `hub.verify_token` equals `ETABIB_META_VERIFY_TOKEN`; otherwise 403.
- `POST /api/hooks/whatsapp` — raw Meta body, unchanged, plus `x-hub-signature-256`. The app
  verifies the **original Meta signature** (HMAC-SHA256 of the raw body with `ETABIB_META_APP_SECRET`).
  Enforced whenever the secret is set; **rejects (401) in production if it is not set**; skipped with
  a warning outside production. Duplicate `wamid` is a no-op in the app.
- `POST /api/hooks/outbound-result` — `{ jobId?, idempotencyKey, consultationId?, messageType, success, status, wamid?, error?{code,message} }`.
- `POST /api/hooks/n8n-error` — `{ workflowName, workflowId, node, executionId, timestamp, errorMessage }`.
- `POST /api/hooks/outbox-dispatch` (new) — re-pushes up to 20 `pending` V1 jobs (oldest first, below
  `max_attempts`, atomic claim). `processing` jobs are never re-sent (n8n may already have sent them).

App → n8n job (`POST ETABIB_N8N_OUTBOUND_URL`, header `x-etabib-key`): `{ jobId, idempotencyKey, type,
audience, consultationId, to, text, data?, callback }`. The app resolves `to` for patient, admin
(`ETABIB_ADMIN_WHATSAPP`) and doctor (`ETABIB_DOCTOR_WHATSAPP`) and supplies `text` for every job.

## 4. Credentials (names only)

| Credential | State |
|---|---|
| `eTabib - App Key (n8n to app)` | existing; attached to every app-bound HTTP node |
| `eTabib - Webhook Key (app to n8n)` | existing; attached to the Outbound Sender webhook |
| `eTabib - Meta Bearer Token` | **does not exist — create manually, then attach to `eTabib - Send WhatsApp message`** |

## 5. Behaviour

- **Success = HTTP 2xx from Graph AND a message id (`wamid`).** Anything else is reported `success:false`.
- **Retries (Outbound Sender):** only timeout/network, 429, 5xx and Meta rate-limit codes
  (1, 2, 4, 17, 32, 613, 130429, 131056, 133016); max **3 attempts**, 2 s / 4 s backoff, same payload and
  same `idempotencyKey`. 4xx, invalid recipient, template, auth and permission errors are not retried.
  The callback node retries 3×; the app treats duplicate results as no-ops.
- **Known limit:** Graph has no idempotency header. A timeout *after* Meta accepted a message can, rarely,
  cause a duplicate send on retry.
- **Failed is final.** A job reported failed is not re-pushed by the Scheduler (only never-delivered
  `pending` jobs are). A failed job needs staff action (Phase 6/7 admin retry).
- **Error workflow / Scheduler / Inbound failures** are reported by the Error Monitor with sanitized
  fields only (name, id, execution id, node, timestamp, 300-char message; the app redacts again).
- **Privacy:** all four workflows store no success execution data and no manual executions.
  Inbound/Outbound/Error Monitor also store no failed execution data (they carry patient content).
  The Scheduler keeps failed executions (no patient data). Global retention is unchanged.
- **Config node** (Outbound Sender): `appBaseUrl`, `graphVersion`, `phoneNumberId`,
  `prescriptionTextFallback`. The app URL also appears literally in the Inbound (2), Error Monitor (1)
  and Scheduler (1) nodes — change per environment.

## 6. Prescription delivery (status)

No PDF generator or signed-URL endpoint exists. By default `PRESCRIPTION_READY` is reported
`failed` with `prescription_document_unavailable`, so **the case does not move to PRESCRIPTION_SENT**
(it stays IN_CONSULTATION and a `PRESCRIPTION_DELIVERY_FAILED` event is recorded). Setting
`Config.prescriptionTextFallback = true` (staging) sends the Pashto header plus a plain-text list of
items; success still requires a `wamid`. A `document` in the payload is rejected
(`document_delivery_not_enabled`) until the signed-URL → media upload → document send path is built.

## 7. Consultation link (status)

Unchanged: the doctor/admin supplies an `https` link on approval; it is stored in
`consultation_link` and put in both confirmation messages (the patient message says the link will
follow if absent). `/api/video/token` is bound to `appointments`; adapting LiveKit to
`consultation_cases` is a Phase 6/7 prerequisite.

## 8. Manual setup still required

1. Create `eTabib - Meta Bearer Token` (Header Auth `Authorization: Bearer …`) and attach it to
   `eTabib - Send WhatsApp message`.
2. Set `Config.phoneNumberId` (placeholder `REPLACE_WITH_ETABIB_PHONE_NUMBER_ID`) and confirm `graphVersion`.
3. In **each** retained workflow's Settings set **Error workflow = eTabib - Error Monitor**. This could
   not be done in Phase 5: the MCP refuses until the Error Monitor is *published*, and no eTabib
   workflow may be activated yet. Do this when the Error Monitor is activated in Phase 6.
4. App env: `ETABIB_HOOK_KEY`, `ETABIB_N8N_OUTBOUND_URL`, `ETABIB_N8N_OUTBOUND_KEY`,
   `ETABIB_ADMIN_WHATSAPP`, `ETABIB_DOCTOR_WHATSAPP`, `ETABIB_META_APP_SECRET`, `ETABIB_META_VERIFY_TOKEN`.
5. **Rotate the Meta verify token.** The old value was stored in plain text in the Inbound workflow and
   remains in its version history. Use a new random token for `ETABIB_META_VERIFY_TOKEN` and in Meta.
6. Staff messages and the prescription are business-initiated; outside the 24 h window WhatsApp requires
   approved templates. Decide templates before production.

## 9. Staging test procedure (Phase 6)

1. Point the app at a staging DB; set the env above with a clearly marked test number.
2. Activate Error Monitor, then set it as the error workflow on the others; activate Outbound Sender,
   Inbound, Scheduler (staging only).
3. Register the staging callback URL with a *test* Meta app. Send `hello` from the test number →
   Pashto ask-name → name → ask-phone → phone → acknowledgement; admin notification arrives.
4. Walk intake → payment → approval → confirmation → prescription; confirm each `outbound-result`.
5. Break things on purpose: wrong key (401), tampered signature (401), invalid recipient, stopped app.

## 10. Production activation checklist

- [ ] Section 8 complete, token rotated, `ETABIB_META_APP_SECRET` set (production fails closed without it)
- [ ] Error workflow attached on all four workflows and verified saved
- [ ] Staging walk-through green, including a failed prescription delivery
- [ ] Prescription document path or text fallback decision made
- [ ] Templates approved for staff / out-of-window messages
- [ ] Meta production webhook registered last, after the workflows are active
