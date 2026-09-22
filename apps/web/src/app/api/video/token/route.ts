import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { appointments, consultationRooms, roomParticipants, practitioners } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'
import { AccessToken } from 'livekit-server-sdk'

const joinRoomSchema = z.object({
  appointmentId: z.string().uuid(),
})

// POST /api/video/token — Get LiveKit token for a consultation room
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = joinRoomSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { appointmentId } = parsed.data

    // Get appointment and verify authorization
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1)

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Verify the user is a participant
    const isPatient = appointment.patientUserId === session.user.id
    let isDoctor = false

    if (!isPatient) {
      const [practitioner] = await db
        .select()
        .from(practitioners)
        .where(
          and(
            eq(practitioners.id, appointment.practitionerId),
            eq(practitioners.userId, session.user.id),
          )
        )
        .limit(1)
      isDoctor = !!practitioner
    }

    if (!isPatient && !isDoctor && session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'You are not authorized for this consultation' }, { status: 403 })
    }

    // Get or create consultation room
    let [room] = await db
      .select()
      .from(consultationRooms)
      .where(eq(consultationRooms.appointmentId, appointmentId))
      .limit(1)

    if (!room) {
      // Create room
      const roomName = `etabeeb-${appointmentId.substring(0, 8)}-${Date.now()}`
      const [newRoom] = await db
        .insert(consultationRooms)
        .values({
          appointmentId,
          livekitRoomName: roomName,
          status: 'waiting',
          recordingEnabled: false,
        })
        .returning()
      room = newRoom
    }
    
    if (!room) {
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    // Register participant
    const participantRole = isDoctor ? 'practitioner' : 'patient'
    await db
      .insert(roomParticipants)
      .values({
        roomId: room.id,
        userId: session.user.id,
        role: participantRole,
        joinedAt: new Date(),
      })
      .onConflictDoNothing() // Prevent duplicate entries

    // Generate LiveKit token
    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET
    const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://localhost:7880'

    let token: string

    if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
      // Real LiveKit token generation
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: session.user.id,
        name: session.user.displayName || session.user.phone || 'User',
        metadata: JSON.stringify({
          role: participantRole,
          appointmentId,
        }),
      })

      at.addGrant({
        roomJoin: true,
        room: room.livekitRoomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      })

      // Token expires in 4 hours (max consultation time)
      token = await at.toJwt()
    } else {
      // Demo mode — generate a mock token for development
      token = `demo_token_${session.user.id}_${room.livekitRoomName}_${Date.now()}`
    }

    return NextResponse.json({
      success: true,
      token,
      roomName: room.livekitRoomName,
      serverUrl: LIVEKIT_URL,
      participant: {
        identity: session.user.id,
        name: session.user.displayName || session.user.phone || 'User',
        role: participantRole,
      },
      demoMode: !LIVEKIT_API_KEY,
    })
  } catch (error) {
    console.error('Video token error:', error)
    return NextResponse.json(
      { error: 'Failed to generate video token' },
      { status: 500 }
    )
  }
}
