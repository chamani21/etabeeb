/**
 * eTabib V1 integration configuration. Values are read from the environment at
 * call time (never cached, never logged, never hardcoded).
 *
 *   ETABIB_HOOK_KEY            n8n → app shared key, sent as `x-etabib-key`
 *   ETABIB_N8N_OUTBOUND_URL    app → n8n "eTabib - Outbound Sender" webhook URL
 *   ETABIB_N8N_OUTBOUND_KEY    app → n8n shared key, sent as `x-etabib-key`
 *   ETABIB_V1_DOCTOR_USER_ID   users.id of the fixed V1 doctor (Dr. Jalaluddin)
 *   ETABIB_ADMIN_WHATSAPP      admin WhatsApp number (E.164) for staff notifications
 *   ETABIB_DOCTOR_WHATSAPP     Dr. Jalaluddin's WhatsApp number (E.164)
 *   ETABIB_META_APP_SECRET     Meta app secret, used to verify X-Hub-Signature-256
 *   ETABIB_META_VERIFY_TOKEN   Meta webhook verification token (GET hub.verify_token)
 *   NEXT_PUBLIC_APP_URL        existing canonical app URL
 */

/** Header used for shared-key authentication in both directions. */
export const ETABIB_KEY_HEADER = 'x-etabib-key'

function readEnv(name: string): string | null {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value.trim() : null
}

export function getHookKey(): string | null {
  return readEnv('ETABIB_HOOK_KEY')
}

export function getOutboundConfig(): { url: string; key: string } | null {
  const url = readEnv('ETABIB_N8N_OUTBOUND_URL')
  const key = readEnv('ETABIB_N8N_OUTBOUND_KEY')
  return url && key ? { url, key } : null
}

export function getAdminWhatsapp(): string | null {
  return readEnv('ETABIB_ADMIN_WHATSAPP')
}

export function getDoctorWhatsapp(): string | null {
  return readEnv('ETABIB_DOCTOR_WHATSAPP')
}

export function getMetaAppSecret(): string | null {
  return readEnv('ETABIB_META_APP_SECRET')
}

export function getMetaVerifyToken(): string | null {
  return readEnv('ETABIB_META_VERIFY_TOKEN')
}

export function getV1DoctorUserId(): string | null {
  return readEnv('ETABIB_V1_DOCTOR_USER_ID')
}

export function getAppUrl(): string | null {
  const url = readEnv('NEXT_PUBLIC_APP_URL')
  return url ? url.replace(/\/+$/, '') : null
}

/** Clinic timezone used to render consultation times in patient messages. */
export const CLINIC_TIMEZONE = 'Asia/Karachi'
