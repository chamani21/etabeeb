import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { adminNotesSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { updateAdminNotes } from '@/lib/etabib/cases'

// POST /api/admin/cases/[id]/notes — operational admin notes (never sent to WhatsApp)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    const parsed = adminNotesSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const notes = parsed.data.notes && parsed.data.notes.length > 0 ? parsed.data.notes : null
    const result = await updateAdminNotes(caseId, notes, { type: 'ADMIN', id: admin.id })
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'admin/notes')
  }
}
