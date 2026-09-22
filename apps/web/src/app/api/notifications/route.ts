import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { inAppNotifications } from '@etabeeb/db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const unreadCount = notifications.filter(n => !n.isRead).length

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// PATCH /api/notifications
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { notificationIds, markAll } = body as {
      notificationIds?: string[]
      markAll?: boolean
    }

    if (markAll) {
      await db
        .update(inAppNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(inAppNotifications.userId, session.user.id),
          eq(inAppNotifications.isRead, false),
        ))
    } else if (notificationIds && notificationIds.length > 0) {
      await db
        .update(inAppNotifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(inAppNotifications.userId, session.user.id),
          inArray(inAppNotifications.id, notificationIds),
        ))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification update error:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
