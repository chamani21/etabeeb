import { z } from 'zod'
import { OWNERSHIP_ACTIONS } from './ownership'

const requestKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

export const sendTextSchema = z
  .object({ body: z.string().min(1).max(4000), clientRequestKey: requestKey, expectedVersion: z.number().int().min(1) })
  .strict()

export const noteSchema = z.object({ body: z.string().min(1).max(2000), caseId: z.string().uuid().nullable().optional() }).strict()

export const ownershipSchema = z
  .object({
    action: z.enum(OWNERSHIP_ACTIONS),
    expectedVersion: z.number().int().min(1),
    summary: z.string().max(1000).optional(),
    attachmentIds: z.array(z.string().uuid()).max(20).optional(),
    reason: z.string().max(500).optional(),
    instruction: z.string().max(1000).optional(),
  })
  .strict()

export const attachmentPatchSchema = z
  .object({
    caseId: z.string().uuid().nullable().optional(),
    label: z.string().max(120).nullable().optional(),
    flagged: z.boolean().optional(),
    reviewed: z.boolean().optional(),
  })
  .strict()

export const messagePatchSchema = z.object({ caseId: z.string().uuid().nullable() }).strict()

export function multipartMeta(form: FormData): { clientRequestKey: string; expectedVersion: number } {
  const parsed = z
    .object({ clientRequestKey: requestKey, expectedVersion: z.coerce.number().int().min(1) })
    .safeParse({ clientRequestKey: form.get('clientRequestKey'), expectedVersion: form.get('expectedVersion') })
  if (!parsed.success) throw Object.assign(new Error('invalid'), { zod: parsed.error })
  return parsed.data
}
