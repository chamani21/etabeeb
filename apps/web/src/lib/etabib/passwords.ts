/**
 * eTabib V1 — staff password change and admin-initiated reset (P1).
 *
 * - bcrypt (cost 12); passwords are never logged, echoed or put in URLs.
 * - Policy: 12–128 characters, not a common/trivial value, not built from the
 *   user's phone/e-mail/name. No arbitrary complexity rules.
 * - A change or a completed reset bumps users.session_version, which revokes
 *   every existing session (see lib/auth.ts jwt callback).
 * - Reset tokens: 32 random bytes (base64url), only the SHA-256 is stored,
 *   single use, 30-minute expiry; issuing a new token voids older ones.
 */
import { createHash, randomBytes } from 'crypto'
import bcryptjs from 'bcryptjs'
import { db } from '@etabeeb/db'
import { passwordResetTokens, roles, userRoles, users } from '@etabeeb/db/schema'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { EtabibError } from './errors'
import { recordStaffAudit, actorTypeForRole } from './staff-audit'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
export const RESET_TOKEN_TTL_MINUTES = 30
const BCRYPT_COST = 12
const STAFF_ROLES = ['administrator', 'practitioner']

// Deliberately small: length does the heavy lifting; this blocks the obvious.
const COMMON = [
  'password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'administrator', 'etabeeb', 'etabib',
  'kozhak', 'doctor', 'iloveyou', 'abc123', 'changeme', 'pakistan', 'afghanistan', 'jalaluddin', 'monkey',
  'dragon', 'football', 'baseball', 'superman', 'trustno1', 'sunshine', 'princess', 'master', 'shadow',
]
const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm', '9876543210']

export type PasswordPolicyError =
  | 'too_short'
  | 'too_long'
  | 'too_common'
  | 'too_repetitive'
  | 'contains_identity'
  | 'mismatch'
  | 'same_as_current'

const POLICY_MESSAGES: Record<PasswordPolicyError, string> = {
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  too_long: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  too_common: 'Password is too common or predictable',
  too_repetitive: 'Password is too repetitive',
  contains_identity: 'Password must not contain your phone number, e-mail or name',
  mismatch: 'New password and confirmation do not match',
  same_as_current: 'New password must be different from the current password',
}

export function checkPasswordPolicy(
  password: string,
  identity: { phone?: string | null; email?: string | null; displayName?: string | null } = {},
): PasswordPolicyError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short'
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long'
  const lower = password.toLowerCase()
  const compact = lower.replace(/[\s\-_.!@#$%^&*()+=]/g, '')
  if (new Set(compact).size < 4) return 'too_repetitive'
  if (COMMON.some((w) => compact.replace(/\d+$/, '').replace(/^\d+/, '') === w || compact === w)) return 'too_common'
  if (COMMON.some((w) => compact.startsWith(w) && compact.slice(w.length).replace(/\d/g, '').length === 0)) return 'too_common'
  if (SEQUENCES.some((s) => s.includes(compact) || compact.length >= 8 && s.repeat(2).includes(compact))) return 'too_common'
  const phoneDigits = (identity.phone ?? '').replace(/\D/g, '')
  if (phoneDigits.length >= 7 && (password.replace(/\D/g, '').includes(phoneDigits.slice(-7)))) return 'contains_identity'
  const emailLocal = (identity.email ?? '').split('@')[0]?.toLowerCase() ?? ''
  if (emailLocal.length >= 4 && compact.includes(emailLocal.replace(/[\s\-_.]/g, ''))) return 'contains_identity'
  const nameParts = (identity.displayName ?? '').toLowerCase().split(/[^\p{L}]+/u).filter((p) => p.length >= 4)
  if (nameParts.some((p) => compact.includes(p))) return 'contains_identity'
  return null
}

function policyError(code: PasswordPolicyError): EtabibError {
  return new EtabibError(`weak_password:${code}`, POLICY_MESSAGES[code], 400)
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

async function staffRoleOf(userId: string): Promise<string | null> {
  const rows = await db
    .select({ role: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)))
  return rows.map((r) => r.role as string).find((r) => STAFF_ROLES.includes(r)) ?? null
}

// ------------------------------------------------------------------
// Change own password
// ------------------------------------------------------------------

export async function changeOwnPassword(input: {
  userId: string
  role: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<{ sessionsRevoked: true }> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1)
  if (!user || !user.passwordHash || !user.isActive || user.deletedAt) {
    throw new EtabibError('unauthorized', 'Unauthorized', 401)
  }
  const actorType = actorTypeForRole(input.role)
  const ok = await bcryptjs.compare(input.currentPassword, user.passwordHash)
  if (!ok) {
    await recordStaffAudit({
      action: 'PASSWORD_CHANGE_REJECTED',
      actorType,
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { reason: 'invalid_current_password' },
    })
    throw new EtabibError('invalid_current_password', 'Current password is incorrect', 400)
  }
  if (input.newPassword !== input.confirmPassword) throw policyError('mismatch')
  const weak = checkPasswordPolicy(input.newPassword, { phone: user.phoneE164, email: user.email, displayName: user.displayName })
  if (weak) throw policyError(weak)
  if (await bcryptjs.compare(input.newPassword, user.passwordHash)) throw policyError('same_as_current')

  const hash = await bcryptjs.hash(input.newPassword, BCRYPT_COST)
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
    await recordStaffAudit(
      { action: 'PASSWORD_CHANGED', actorType, actorId: user.id, targetType: 'user', targetId: user.id, metadata: { sessionsRevoked: true } },
      tx,
    )
  })
  return { sessionsRevoked: true }
}

// ------------------------------------------------------------------
// Admin-initiated reset
// ------------------------------------------------------------------

export async function issuePasswordReset(input: {
  targetUserId: string
  adminId: string
}): Promise<{ token: string; expiresAt: Date }> {
  const [target] = await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1)
  if (!target || target.deletedAt) throw new EtabibError('not_found', 'Staff account not found', 404)
  const role = await staffRoleOf(target.id)
  if (!role) throw new EtabibError('not_staff', 'Password reset is only available for staff accounts', 400)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000)
  await db.transaction(async (tx) => {
    // Void any still-valid earlier tokens for this user
    await tx
      .update(passwordResetTokens)
      .set({ expiresAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, target.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
    await tx.insert(passwordResetTokens).values({
      userId: target.id,
      tokenHash: hashResetToken(token),
      createdBy: input.adminId,
      expiresAt,
    })
    await recordStaffAudit(
      {
        action: 'PASSWORD_RESET_REQUESTED',
        actorType: 'ADMIN',
        actorId: input.adminId,
        targetType: 'user',
        targetId: target.id,
        metadata: { targetRole: role, expiresAt: expiresAt.toISOString() },
      },
      tx,
    )
  })
  return { token, expiresAt }
}

export async function completePasswordReset(input: {
  token: string
  newPassword: string
  confirmPassword: string
}): Promise<{ sessionsRevoked: true }> {
  const tokenHash = hashResetToken(input.token)
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1)
  const reject = async (reason: 'unknown' | 'used' | 'expired') => {
    await recordStaffAudit({
      action: 'PASSWORD_RESET_REJECTED',
      actorType: 'ANONYMOUS',
      targetType: row ? 'user' : undefined,
      targetId: row?.userId,
      metadata: { reason },
    })
    return new EtabibError('invalid_or_expired_token', 'This reset link is invalid or has expired', 400)
  }
  if (!row) throw await reject('unknown')
  if (row.usedAt) throw await reject('used')
  if (row.expiresAt.getTime() <= Date.now()) throw await reject('expired')

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1)
  if (!user || user.deletedAt) throw await reject('unknown')
  if (input.newPassword !== input.confirmPassword) throw policyError('mismatch')
  const weak = checkPasswordPolicy(input.newPassword, { phone: user.phoneE164, email: user.email, displayName: user.displayName })
  if (weak) throw policyError(weak)
  const hash = await bcryptjs.hash(input.newPassword, BCRYPT_COST)

  await db.transaction(async (tx) => {
    // Atomic single-use claim: a concurrent second use finds no row
    const claimed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.id, row.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ id: passwordResetTokens.id })
    if (!claimed[0]) throw new EtabibError('invalid_or_expired_token', 'This reset link is invalid or has expired', 400)
    await tx
      .update(users)
      .set({
        passwordHash: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
    await recordStaffAudit(
      {
        action: 'PASSWORD_RESET_COMPLETED',
        actorType: 'ANONYMOUS',
        targetType: 'user',
        targetId: user.id,
        metadata: { resetTokenId: row.id, sessionsRevoked: true },
      },
      tx,
    )
  })
  return { sessionsRevoked: true }
}

/** Staff accounts for the admin reset screen (no hashes, masked phone in UI). */
export async function listStaffAccounts() {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      phoneE164: users.phoneE164,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      role: roles.name,
    })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.revokedAt)))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(isNull(users.deletedAt))
  return rows.filter((r) => STAFF_ROLES.includes(r.role as string))
}
