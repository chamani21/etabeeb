# eTabib V1 — WhatsApp message templates (P1)

Free-form WhatsApp text reaches a recipient only inside Meta's **24-hour customer-care
window** (opened when that person last messaged the business number). Staff notices,
confirmations and the prescription are business-initiated and need an **approved
template** outside that window.

## How it works

- The backend decides **intent, recipient, language and parameters**
  (`apps/web/src/lib/etabib/templates.ts`). n8n only transports.
- A template is used for an intent **only** when it is listed in `ETABIB_WA_TEMPLATES`
  (i.e. created **and approved** in WhatsApp Manager). Unlisted intents use the text path
  unchanged.
- Conversational patient replies (ask name/phone, acknowledgement, case-in-progress) are
  **always text** — the patient has just written, so the window is open.
- Template payloads are built server-side and strictly validated (body parameters only,
  text only, no newlines/tabs, ≤1024 chars, name `^[a-z0-9_]+$`). Nothing from the
  browser can shape a template.
- A misconfigured template fails that job permanently (`invalid_template`) instead of
  retrying; an invalid `ETABIB_WA_TEMPLATES` value disables templates (text fallback).

```
ETABIB_WA_TEMPLATES='{"ADMIN_NEW_CASE":{"name":"etabib_admin_new_case_v1","language":"en"},
                      "DOCTOR_APPROVAL_REQUEST":{"name":"etabib_doctor_approval_v1","language":"en"}}'
```

## Proposed templates (submit in WhatsApp Manager → Message templates, category **Utility**)

None of these exist yet; names are **proposals** — keep them or record the approved names
in `ETABIB_WA_TEMPLATES`. Each body has only body variables (no header/buttons).

| Intent | Proposed name | Language | Wired | Body (variables in order) |
|---|---|---|---|---|
| `ADMIN_NEW_CASE` | `etabib_admin_new_case_v2` | `en` | yes | eTabeeb — New consultation request. Patient: {{1}}. Phone: {{2}}. Chat with patient: {{3}} Open intake form: {{4}} Ref: {{5}} |
| `DOCTOR_APPROVAL_REQUEST` | `etabib_doctor_approval_v2` | `en` | yes | eTabeeb — Consultation approval required. Patient: {{1}}. Age/Sex: {{2}}. Location: {{3}}. Proposed time: {{4}}. Review & approve: {{5}} Clinical details are available securely in the doctor dashboard. |
| `CONSULTATION_CONFIRMED_DOCTOR` | `etabib_doctor_confirmed_v2` | `en` | yes | eTabeeb — Consultation confirmed. Patient: {{1}}. Time: {{2}}. Open case & join video: {{3}} |
| `CONSULTATION_CONFIRMED` (patient) | `etabib_consultation_confirmed_ps_v2` | `ps_AF` | yes | ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه. وخت: {{1}}. د آنلاین مشورې لپاره دا خوندي لینک خلاص کړئ: {{2}} که کومه پوښتنه لرئ، زموږ له استازي سره دلته خبرې وکړئ: {{3}} |
| `CONSULTATION_CANCELLED` (patient) | `etabib_consultation_cancelled_ps` | `ps_AF` | yes | محترم/محترمه {{1}}، ستاسو د eTabeeb آنلاین مشوره لغوه شوه. د لغوه کېدو لامل: {{2}}. که غواړئ بله مشوره وټاکئ یا کومه پوښتنه لرئ، زموږ له استازي سره دلته خبرې وکړئ: {{3}} |
| `ADMIN_CONSULTATION_CANCELLED` | `etabib_admin_consultation_cancelled_v1` | `en` | yes | eTabeeb — Consultation cancelled by doctor. Patient: {{1}}. Scheduled time: {{2}}. Reason: {{3}}. Open case: {{4}} |
| `DOCTOR_CONSULTATION_CANCELLED` | `etabib_doctor_consultation_cancelled_v1` | `en` | yes | eTabeeb — Consultation cancelled. Patient: {{1}}. Scheduled time: {{2}}. View case: {{3}} |
| `PATIENT_PRESCRIPTION_READY` | `etabib_prescription_ready_ps_v1` | `ps_AF` | yes | ستاسو نسخه چمتو ده. د نسخې شمېره: {{1}}. درمل: {{2}}. د بشپړې نسخې لپاره همدې شمېرې ته ځواب ولیکئ. |
| `CONSULTATION_TIME_CHANGED` | `etabib_time_changed_ps_v1` | `ps_AF` | no (defined only) | ستاسو د مشورې وخت بدل شو. نوی وخت: {{1}}. د پوښتنو لپاره همدې شمېرې ته ولیکئ. |
| `FOLLOWUP_REMINDER` | `etabib_followup_reminder_ps_v1` | `ps_AF` | no (defined only) | یادونه: ستاسو د بیا کتنې وخت له ډاکټر جلال الدین سره {{1}} دی. |

The `_v2` bodies replace the v1 proposals (lock-screen safe staff notices with direct links,
patient help link). If a v1 template was already approved, do not map it to the v2 intent:
the parameter count differs and the backend rejects the mismatch (job fails as `invalid_template`).

**Cancellation without an approved template.** Inside the 24-hour customer-care window the
Pashto cancellation is sent as text. Outside it Meta rejects free-form text (e.g. error
131047); the job is then shown as **failed** in the admin outbox — never as delivered.

Sample values for review: patient "Test Patient", phone "+92 300 0000000", case "1a2b3c4d",
time "2026-10-05 12:00 (Pakistan time)", link "https://staging-v1.etabeeb.online/consult/…",
help "https://wa.me/923000000000?text=…", reason "د وخت ټاکلو ستونزه",
intake form "https://staging-v1.etabeeb.online/admin/cases/1a2b3c4d-…".

### Verify before submitting

1. **Pashto language code.** `ps_AF` is the proposed code. Confirm Pashto is offered in
   WhatsApp Manager's language list for your WABA. If it is not, do **not** substitute
   Urdu/English for patient templates without an explicit decision — patient messages are
   Pashto-only.
2. **Prescription by template** carries only the prescription number and a one-line
   medicine summary (templates cannot contain multi-line content). The full text
   prescription can follow as a normal message once the patient replies (window opens).
3. Meta may re-categorise as Marketing; keep the wording transactional.

## Activation checklist (per environment)

1. Create and get approval for each template above (Meta app/WABA of that environment).
2. Put the approved name/language per intent into `ETABIB_WA_TEMPLATES`.
3. Recreate only the web service. The admin **System status** page lists the active templates.
4. Test with a recipient whose 24-hour window is **closed** (no message for > 24 h).
