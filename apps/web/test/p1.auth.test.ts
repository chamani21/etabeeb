/**
 * P1.5 — staff password change, admin-initiated reset, forced rotation,
 * session revocation, login hardening. Synthetic accounts only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import bcryptjs from 'bcryptjs'
import { db } from '@etabeeb/db'
import { passwordResetTokens, staffAuditEvents, users } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { authOptions, refreshSessionState } from '@/lib/auth'
import { checkPasswordPolicy } from '@/lib/etabib/passwords'
import { POST as changeRoute } from '@/app/api/account/password/route'
import { POST as resetIssueRoute } from '@/app/api/admin/staff/[id]/reset-password/route'
import { POST as resetCompleteRoute } from '@/app/api/auth/password-reset/route'
import { GET as staffListRoute } from '@/app/api/admin/staff/route'
import { POST as registerRoute } from '@/app/api/auth/register/route'
import { GET as adminListRoute } from '@/app/api/admin/cases/route'
import { NextRequest } from 'next/server'
import { hasTestDb, resetDb, jsonRequest, createStaffUser } from './helpers'

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
function loginAs(id: string | null, role = 'administrator', mustChangePassword = false) {
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Synthetic', locale: 'en', mustChangePassword } as SessionUser) : null)
}
const TEMP = 'Temporary-Staging-Pass-01'
const GOOD = 'correct horse battery staple 42'
const authorize = (authOptions.providers[0] as any).options.authorize as (c: Record<string, string>) => Promise<any>
const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!
const audit = async () => (await db.select().from(staffAuditEvents)).map((a) => a.action)

describe('password policy', () => {
  it('requires 12+ characters and rejects trivial or identity-based values', () => {
    expect(checkPasswordPolicy('short-1')).toBe('too_short')
    expect(checkPasswordPolicy('a'.repeat(129))).toBe('too_long')
    expect(checkPasswordPolicy('aaaaaaaaaaaaaa')).toBe('too_repetitive')
    expect(checkPasswordPolicy('password123456')).toBe('too_common')
    expect(checkPasswordPolicy('Etabeeb2026!!!!')).toBe('too_common')
    expect(checkPasswordPolicy('qwertyuiopasdf')).toBe('too_common')
    expect(checkPasswordPolicy('my 3001234567 code', { phone: '+923001234567' })).toBe('contains_identity')
    expect(checkPasswordPolicy('jalaluddin-secure-77', { displayName: 'Dr. Jalaluddin' })).toBe('contains_identity')
    expect(checkPasswordPolicy(GOOD)).toBeNull()
  })
})

describe.skipIf(!hasTestDb)('P1 auth', () => {
  let admin: { id: string; phone: string }
  let doctor: { id: string; phone: string }
  beforeEach(async () => {
    await resetDb()
    admin = await createStaffUser('administrator', { password: TEMP, mustChangePassword: true, displayName: 'Synthetic Admin' })
    doctor = await createStaffUser('practitioner', { password: TEMP, mustChangePassword: true, displayName: 'Synthetic Doctor' })
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctor.id
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.test'
    mockUser.mockReset()
  })

  describe('login hardening', () => {
    it('accepts the local 03… format, carries session version and rotation flag; rejects disabled accounts', async () => {
      const local = '0' + admin.phone.slice(3)
      const u = await authorize({ phone: local, password: TEMP })
      expect(u).toMatchObject({ id: admin.id, role: 'administrator', mustChangePassword: true, sessionVersion: 0 })
      expect(await authorize({ phone: local, password: 'wrong-password-xyz' })).toBeNull()
      await db.update(users).set({ isActive: false }).where(eq(users.id, admin.id))
      expect(await authorize({ phone: admin.phone, password: TEMP })).toBeNull()
    })
  })

  describe('change password', () => {
    const change = (body: unknown) => changeRoute(jsonRequest('/api/account/password', body))

    it('is allowed while rotation is forced and clears the flag; revokes existing sessions', async () => {
      loginAs(admin.id, 'administrator', true)
      expect((await adminListRoute(new NextRequest('http://localhost/api/admin/cases'))).status).toBe(403)
      const oldToken = { id: admin.id, sessionVersion: 0 } as any
      expect((await refreshSessionState(oldToken)).revoked).toBeFalsy()

      const res = await change({ currentPassword: TEMP, newPassword: GOOD, confirmPassword: GOOD })
      expect(res.status).toBe(200)
      const row = await userRow(admin.id)
      expect(row.mustChangePassword).toBe(false)
      expect(row.sessionVersion).toBe(1)
      expect(row.passwordChangedAt).not.toBeNull()
      expect(await bcryptjs.compare(GOOD, row.passwordHash!)).toBe(true)
      expect((await refreshSessionState(oldToken)).revoked).toBe(true)
      expect(await authorize({ phone: admin.phone, password: TEMP })).toBeNull()
      expect(await authorize({ phone: admin.phone, password: GOOD })).toMatchObject({ mustChangePassword: false, sessionVersion: 1 })
      expect(await audit()).toEqual(['PASSWORD_CHANGED'])
    })

    it('rejects a wrong current password (audited), weak, mismatched or reused passwords', async () => {
      loginAs(doctor.id, 'practitioner', true)
      let res = await change({ currentPassword: 'not-the-password', newPassword: GOOD, confirmPassword: GOOD })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe('invalid_current_password')
      expect(await audit()).toEqual(['PASSWORD_CHANGE_REJECTED'])
      res = await change({ currentPassword: TEMP, newPassword: 'short', confirmPassword: 'short' })
      expect((await res.json()).code).toBe('weak_password:too_short')
      res = await change({ currentPassword: TEMP, newPassword: GOOD, confirmPassword: GOOD + 'x' })
      expect((await res.json()).code).toBe('weak_password:mismatch')
      res = await change({ currentPassword: TEMP, newPassword: TEMP, confirmPassword: TEMP })
      expect((await res.json()).code).toBe('weak_password:same_as_current')
      expect((await userRow(doctor.id)).sessionVersion).toBe(0)
    })

    it('requires a signed-in staff session', async () => {
      loginAs(null)
      expect((await change({ currentPassword: TEMP, newPassword: GOOD, confirmPassword: GOOD })).status).toBe(401)
      loginAs(admin.id, 'patient')
      expect((await change({ currentPassword: TEMP, newPassword: GOOD, confirmPassword: GOOD })).status).toBe(403)
    })

    it('never stores or audits the password text', async () => {
      loginAs(admin.id, 'administrator', true)
      await change({ currentPassword: TEMP, newPassword: GOOD, confirmPassword: GOOD })
      const raw = JSON.stringify(await db.select().from(staffAuditEvents))
      expect(raw).not.toContain(GOOD)
      expect(raw).not.toContain(TEMP)
    })
  })

  describe('admin-initiated reset', () => {
    async function issue(targetId: string) {
      loginAs(admin.id, 'administrator', false)
      const res = await resetIssueRoute(jsonRequest('/x', {}), { params: { id: targetId } })
      const body = await res.json()
      return { status: res.status, body, token: body.resetUrl ? new URL(body.resetUrl).hash.replace('#token=', '') : '' }
    }
    const complete = (token: string, pw = GOOD) => resetCompleteRoute(jsonRequest('/api/auth/password-reset', { token, newPassword: pw, confirmPassword: pw }))

    it('issues a one-time fragment link (hash only stored), completes, revokes sessions, audits', async () => {
      const { status, body, token } = await issue(doctor.id)
      expect(status).toBe(200)
      expect(body.resetUrl).toMatch(/^https:\/\/staging\.example\.test\/reset-password#token=[A-Za-z0-9_-]{40,}$/)
      const [row] = await db.select().from(passwordResetTokens)
      expect(row!.tokenHash).not.toBe(token)
      expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000)

      const oldToken = { id: doctor.id, sessionVersion: 0 } as any
      mockUser.mockReset() // the reset endpoint is public
      const res = await complete(token)
      expect(res.status).toBe(200)
      const user = await userRow(doctor.id)
      expect(user.sessionVersion).toBe(1)
      expect(user.mustChangePassword).toBe(false)
      expect(await bcryptjs.compare(GOOD, user.passwordHash!)).toBe(true)
      expect((await refreshSessionState(oldToken)).revoked).toBe(true)
      expect(await audit()).toEqual(['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED'])
      expect(JSON.stringify(await db.select().from(staffAuditEvents))).not.toContain(token)
    })

    it('a token cannot be reused', async () => {
      const { token } = await issue(doctor.id)
      expect((await complete(token)).status).toBe(200)
      const again = await complete(token, 'another long synthetic passphrase')
      expect(again.status).toBe(400)
      expect((await again.json()).code).toBe('invalid_or_expired_token')
    })

    it('an expired token is rejected', async () => {
      const { token } = await issue(doctor.id)
      await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) })
      expect((await complete(token)).status).toBe(400)
      expect((await userRow(doctor.id)).sessionVersion).toBe(0)
    })

    it('an unknown or malformed token is rejected; a weak password does not consume the token', async () => {
      expect((await complete('A'.repeat(43))).status).toBe(400)
      expect((await complete('bad token!')).status).toBe(400)
      const { token } = await issue(doctor.id)
      const weak = await complete(token, 'password123456')
      expect((await weak.json()).code).toBe('weak_password:too_common')
      expect((await complete(token)).status).toBe(200)
    })

    it('issuing a new link voids the previous one', async () => {
      const first = await issue(doctor.id)
      const second = await issue(doctor.id)
      expect((await complete(first.token)).status).toBe(400)
      expect((await complete(second.token)).status).toBe(200)
    })

    it('only admins can issue; only staff accounts can be reset', async () => {
      loginAs(doctor.id, 'practitioner')
      expect((await resetIssueRoute(jsonRequest('/x', {}), { params: { id: admin.id } })).status).toBe(403)
      const patient = await createStaffUser('patient')
      expect((await issue(patient.id)).status).toBe(400)
      expect(await db.select().from(passwordResetTokens)).toHaveLength(0)
    })

    it('staff list shows rotation state and masked phones, never hashes', async () => {
      loginAs(admin.id, 'administrator')
      const body = await (await staffListRoute()).json()
      expect(body.staff).toHaveLength(2)
      const raw = JSON.stringify(body)
      expect(raw).not.toMatch(/\$2[aby]\$/)
      expect(raw).not.toContain(admin.phone)
      expect(body.staff.every((s: any) => s.mustChangePassword === true)).toBe(true)
    })
  })

  it('public registration stays disabled', async () => {
    expect((await registerRoute()).status).toBe(404)
  })
})
