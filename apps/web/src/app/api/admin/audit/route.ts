import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/audit — Get audit log (admin only)
export async function GET(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { db } = await import('@etabeeb/db')
    const { auditEvents, users } = await import('@etabeeb/db/schema')
    const { desc, eq, and, gte, lte } = await import('drizzle-orm')

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const userId = url.searchParams.get('userId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)

    const conditions = []
    if (action) conditions.push(eq(auditEvents.action, action as any))
    if (userId) conditions.push(eq(auditEvents.actorId, userId))
    if (from) conditions.push(gte(auditEvents.occurredAt, new Date(from)))
    if (to) conditions.push(lte(auditEvents.occurredAt, new Date(to)))

    const events = await db
      .select()
      .from(auditEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit)

    return NextResponse.json({ events, total: events.length })
  } catch (error) {
    console.error('Audit fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
