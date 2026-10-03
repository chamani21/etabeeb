/**
 * Public self-registration is disabled for eTabib V1 (WhatsApp-first onboarding).
 */
import { describe, it, expect } from 'vitest'
import { POST as register } from '@/app/api/auth/register/route'

describe('POST /api/auth/register', () => {
  it('is disabled and creates nothing', async () => {
    const res = await register()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Registration is not available', code: 'registration_disabled' })
  })
})
