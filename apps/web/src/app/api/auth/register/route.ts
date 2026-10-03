import { NextResponse } from 'next/server'

// POST /api/auth/register — public self-registration is disabled.
// eTabib V1 onboards patients WhatsApp-first (POST /api/hooks/whatsapp);
// staff accounts are provisioned by an administrator, never publicly.
// The previous implementation is in git history (8a475ad) if it is ever re-enabled.
export async function POST() {
  return NextResponse.json(
    { error: 'Registration is not available', code: 'registration_disabled' },
    { status: 404 }
  )
}
