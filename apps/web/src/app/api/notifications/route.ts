import { NextRequest, NextResponse } from 'next/server'

// GET /api/notifications — Get user's in-app notifications
export async function GET(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await import('@etabeeb/db')
    const { inAppNotifications } = await import('@etabeeb/db/schema')
    const { eq, desc, and } = await import('drizzle-orm')

    const url = new URL(req.url)
    const unreadOnly = url.searchParams.get('unread') === 'true'

    const conditions = [eq(inAppNotifications.userId, session.user.id)]
    if (unreadOnly) {
      conditions.push(eq(inAppNotifications.isRead, false))
    }

    const notifications = await db
      .select()
      .from(inAppNotifications)
      .where(and(...conditions))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(50)

    // Get unread count
    const unreadCount = notifications.filter(n => !n.isRead).length

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// PATCH /api/notifications — Mark notifications as read
export async function PATCH(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { notificationIds, markAll } = body

    const { db } = await import('@etabeeb/db')
    const { inAppNotifications } = await import('@etabeeb/db/schema')
    const { eq, and, inArray } = await import('drizzle-orm')

    if (markAll) {
      await db
        .update(inAppNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(inAppNotifications.userId, session.user.id),
            eq(inAppNotifications.isRead, false),
          )
        )
    } else if (notificationIds?.length > 0) {
      await db
        .update(inAppNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(inAppNotifications.userId, session.user.id),
            inArray(inAppNotifications.id, notificationIds),
          )
        )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification update error:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
