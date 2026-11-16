import { NextResponse } from 'next/server'

// POST /api/video/token — RETIRED (legacy appointment-bound LiveKit tokens with
// demo-mode fallback and admin access). eTabib V1 video uses case-bound rooms:
//   patient: POST /api/video/patient/token (secure link)
//   doctor:  POST /api/doctor/cases/[id]/video/token (authenticated)
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been retired', code: 'gone' }, { status: 410 })
}
