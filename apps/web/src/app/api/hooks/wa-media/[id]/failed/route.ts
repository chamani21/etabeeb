import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireHookKey } from '@/lib/etabib/auth'
import { EtabibError, errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'
import { markFetchFailed } from '@/lib/etabib/inbox/media'

const schema = z.object({ attachment_id: z.string().uuid().optional(), error: z.string().max(300).optional() }).passthrough()

// POST /api/hooks/wa-media/[id]/failed — n8n could not download the file (staff see it and can retry)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireHookKey(req)
    if (!isInboxEnabled() || !/^[0-9a-f-]{36}$/i.test(params.id)) throw new EtabibError('not_found', 'Not found', 404)
    const parsed = schema.safeParse(await readJson(req, 4 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    await markFetchFailed(params.id, parsed.data.error ?? 'download failed')
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'hooks/wa-media-failed')
  }
}
