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
 *
 * P1 hardening (non-secret operational settings):
 *   ETABIB_WHATSAPP_INBOUND_ENABLED  global inbound kill switch: "true" | "false" (default false)
 *   ETABIB_INBOUND_MODE              disabled | allowlist | public (default allowlist; invalid → disabled)
 *   ETABIB_WA_TEMPLATES              JSON intent → { name, language } of APPROVED Meta templates
 *   ETABIB_ENVIRONMENT               display label, e.g. "staging"
 *   ETABIB_WHATSAPP_DISPLAY_NUMBER   display label for the business number, e.g. "+92 310 0006526"
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

// ------------------------------------------------------------------
// P1 hardening: inbound control + operational labels
// ------------------------------------------------------------------

export type InboundMode = 'disabled' | 'allowlist' | 'public'
const INBOUND_MODES: readonly InboundMode[] = ['disabled', 'allowlist', 'public']

/** Global inbound kill switch. Anything other than the literal "true" means OFF. */
export function isInboundEnabled(): boolean {
  return readEnv('ETABIB_WHATSAPP_INBOUND_ENABLED')?.toLowerCase() === 'true'
}

/** Inbound sender mode. Unset → allowlist; an unrecognised value fails closed (disabled). */
export function getInboundMode(): InboundMode {
  const raw = readEnv('ETABIB_INBOUND_MODE')
  if (!raw) return 'allowlist'
  const mode = raw.toLowerCase() as InboundMode
  if (INBOUND_MODES.includes(mode)) return mode
  console.error('[etabib:config] ETABIB_INBOUND_MODE has an unsupported value; treating inbound as disabled')
  return 'disabled'
}

export function getEnvironmentLabel(): string {
  return readEnv('ETABIB_ENVIRONMENT') ?? 'unspecified'
}

export function getWhatsappDisplayNumber(): string | null {
  return readEnv('ETABIB_WHATSAPP_DISPLAY_NUMBER')
}

/** Raw template mapping JSON (validated in templates.ts). */
export function getTemplateConfigRaw(): string | null {
  return readEnv('ETABIB_WA_TEMPLATES')
}
