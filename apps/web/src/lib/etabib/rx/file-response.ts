import { NextRequest, NextResponse } from 'next/server'
import { EtabibError } from '../errors'
import { prescriptionFile } from './service'

/** Authorized staff download/view of a stored prescription image or PDF. */
export async function prescriptionFileResponse(req: NextRequest, caseId: string): Promise<NextResponse> {
  const u = new URL(req.url)
  const rxId = u.searchParams.get('rx') ?? ''
  const kind = u.searchParams.get('kind') === 'pdf' ? 'pdf' : 'image'
  const page = Math.max(1, Math.min(20, Number(u.searchParams.get('page') ?? 1) || 1))
  if (!/^[0-9a-f-]{36}$/i.test(rxId)) throw new EtabibError('not_found', 'Prescription not found', 404)
  const file = await prescriptionFile(caseId, rxId, kind, page)
  if (!file) throw new EtabibError('not_found', 'Prescription file not available', 404)
  const disposition = u.searchParams.get('download') === '1' ? 'attachment' : 'inline'
  return new NextResponse(new Uint8Array(file.data), {
    headers: { 'content-type': file.contentType, 'content-disposition': `${disposition}; filename="${file.filename}"`, 'cache-control': 'private, no-store' },
  })
}
