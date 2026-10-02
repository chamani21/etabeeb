import { timingSafeEqual, createHash } from 'crypto'
import { getCurrentUser } from '@/lib/auth-helpers'
import { EtabibError } from './errors'
import { ETABIB_KEY_HEADER, getHookKey, getV1DoctorUserId } from './config'

export interface StaffActor {
  id: string
  role: string
}

/** Admin routes: existing NextAuth session + `administrator` role. */
export async function requireAdmin(): Promise<StaffActor> {
  const user = await getCurrentUser()
  if (!user?.id) throw new EtabibError('unauthorized', 'Unauthorized', 401)
  if (user.role !== 'administrator') throw new EtabibError('forbidden', 'Admin access required', 403)
  return { id: user.id, role: user.role }
}

/**
 * Doctor routes: existing NextAuth session + `practitioner` role + identity must
 * be the single configured V1 doctor (Dr. Jalaluddin). Fails closed when the
 * doctor identity is not configured.
 */
export async function requireV1Doctor(): Promise<StaffActor> {
  const user = await getCurrentUser()
  if (!user?.id) throw new EtabibError('unauthorized', 'Unauthorized', 401)
  const doctorUserId = getV1DoctorUserId()
  if (!doctorUserId) {
    console.error('[etabib:auth] ETABIB_V1_DOCTOR_USER_ID is not configured')
    throw new EtabibError('forbidden', 'Doctor access not configured', 403)
  }
  if (user.role !== 'practitioner' || user.id !== doctorUserId) {
    throw new EtabibError('forbidden', 'Not authorized for eTabib consultations', 403)
  }
  return { id: user.id, role: user.role }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Hook routes (n8n → app): constant-time comparison of the `x-etabib-key`
 * header against ETABIB_HOOK_KEY. Rejects when the key is not configured.
 * The header value is never logged.
 */
export function requireHookKey(req: Request): void {
  const expected = getHookKey()
  if (!expected) {
    console.error('[etabib:auth] ETABIB_HOOK_KEY is not configured — rejecting hook call')
    throw new EtabibError('unauthorized', 'Unauthorized', 401)
  }
  const provided = req.headers.get(ETABIB_KEY_HEADER)
  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new EtabibError('unauthorized', 'Unauthorized', 401)
  }
}
