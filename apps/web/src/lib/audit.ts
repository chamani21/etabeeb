/**
 * eTabeeb Audit Service
 * Append-only audit logging for all sensitive actions
 */

type AuditAction =
  | 'login' | 'logout' | 'session_revoked'
  | 'otp_requested' | 'otp_verified' | 'otp_failed'
  | 'appointment_created' | 'appointment_status_changed' | 'appointment_cancelled'
  | 'encounter_created' | 'encounter_signed' | 'encounter_addendum'
  | 'prescription_created' | 'prescription_signed' | 'prescription_revoked'
  | 'document_uploaded' | 'document_downloaded' | 'document_scanned'
  | 'payment_created' | 'payment_verified' | 'payment_bypassed' | 'refund_issued'
  | 'whatsapp_sent' | 'whatsapp_failed'
  | 'practitioner_published' | 'practitioner_unpublished'
  | 'role_granted' | 'role_revoked'
  | 'admin_action' | 'security_event' | 'data_access'

interface AuditEntry {
  action: AuditAction
  actorId?: string | null
  actorRole?: string
  targetType?: string
  targetId?: string
  ipAddress?: string
  userAgent?: string
  traceId?: string
  outcome?: 'success' | 'failure' | 'denied'
  notes?: string
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { db } = await import('@etabeeb/db')
    const { auditEvents } = await import('@etabeeb/db/schema')

    await db.insert(auditEvents).values({
      action: entry.action as any,
      actorId: entry.actorId || null,
      actorRole: entry.actorRole || null,
      targetType: entry.targetType || null,
      targetId: entry.targetId || null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent || null,
      traceId: entry.traceId || null,
      outcome: entry.outcome || 'success',
      notes: entry.notes || null,
    })
  } catch (error) {
    // Audit logging should NEVER break the main operation
    // Log to stderr as fallback
    console.error('[AUDIT_FALLBACK]', JSON.stringify(entry), error)
  }
}

/**
 * Helper to extract audit context from a NextRequest
 */
export function getAuditContext(req: Request) {
  return {
    ipAddress: (req.headers as any).get?.('x-forwarded-for')
      || (req.headers as any).get?.('x-real-ip')
      || 'unknown',
    userAgent: (req.headers as any).get?.('user-agent') || 'unknown',
    traceId: (req.headers as any).get?.('x-request-id') || undefined,
  }
}
