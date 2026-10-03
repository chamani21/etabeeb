import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { EtabibError, errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { caseIdSchema, readJson, senderUpdateSchema } from '@/lib/etabib/schemas'
import { updateSender } from '@/lib/etabib/senders'

// PATCH /api/admin/senders/[id] — edit label/purpose/notes or (de)activate. No hard delete.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    if (!caseIdSchema.safeParse(params.id).success) throw new EtabibError('invalid_id', 'Invalid sender id', 400)
    const parsed = senderUpdateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const patch: Parameters<typeof updateSender>[1] = {}
    if (parsed.data.label !== undefined) patch.label = parsed.data.label
    if (parsed.data.purpose !== undefined) patch.purpose = parsed.data.purpose
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes
    if (parsed.data.active !== undefined) patch.active = parsed.data.active
    const result = await updateSender(params.id, patch, { id: admin.id, type: 'ADMIN' })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return errorResponse(error, 'admin/senders-update')
  }
}
