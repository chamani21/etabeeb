import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@etabeeb/db'
import { practitioners, availabilityRules, availabilityExceptions, appointments } from '@etabeeb/db/schema'
import { eq, and, gte, lt, or } from 'drizzle-orm'

// GET /api/doctors/[id]/slots?date=2026-09-22 — Get available slots for a doctor
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(req.url)
    const dateStr = url.searchParams.get('date')

    if (!dateStr) {
      return NextResponse.json(
        { error: 'date parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const targetDate = new Date(dateStr)
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      )
    }

    // Get practitioner
    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.publicId, params.id))
      .limit(1)

    if (!practitioner) {
      return NextResponse.json(
        { error: 'Doctor not found' },
        { status: 404 }
      )
    }

    // Check if date is an exception (leave day)
    const dayStart = new Date(dateStr + 'T00:00:00Z')
    const dayEnd = new Date(dateStr + 'T23:59:59Z')

    const exceptions = await db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.practitionerId, practitioner.id),
          gte(availabilityExceptions.exceptionDate, dayStart),
          lt(availabilityExceptions.exceptionDate, dayEnd),
        )
      )

    // If marked as unavailable, return no slots
    const isUnavailable = exceptions.some(e => !e.isAvailable)
    if (isUnavailable) {
      return NextResponse.json({
        doctorId: params.id,
        date: dateStr,
        slots: [],
        message: 'Doctor is not available on this date',
      })
    }

    // Get availability rules for this day of week
    const dayOfWeek = targetDate.getDay() // 0=Sun, 6=Sat

    const rules = await db
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.practitionerId, practitioner.id),
          eq(availabilityRules.isActive, true),
          eq(availabilityRules.dayOfWeek, dayOfWeek),
        )
      )

    if (rules.length === 0) {
      return NextResponse.json({
        doctorId: params.id,
        date: dateStr,
        slots: [],
        message: 'No availability rules set for this day',
      })
    }

    // Generate slots from rules
    const allSlots: Array<{
      start: string
      end: string
      consultationType: string
      available: boolean
    }> = []

    for (const rule of rules) {
      const partsStart = rule.slotStartTime.split(':').map(Number)
      const startHour = partsStart[0] ?? 0
      const startMin = partsStart[1] ?? 0
      
      const partsEnd = rule.slotEndTime.split(':').map(Number)
      const endHour = partsEnd[0] ?? 0
      const endMin = partsEnd[1] ?? 0

      const ruleStart = new Date(targetDate)
      ruleStart.setUTCHours(startHour, startMin, 0, 0)

      const ruleEnd = new Date(targetDate)
      ruleEnd.setUTCHours(endHour, endMin, 0, 0)

      const slotDuration = rule.slotDurationMinutes || 15
      const buffer = rule.bufferMinutes || 0

      let current = new Date(ruleStart)
      while (current < ruleEnd) {
        const slotEnd = new Date(current.getTime() + slotDuration * 60000)
        if (slotEnd > ruleEnd) break

        allSlots.push({
          start: current.toISOString(),
          end: slotEnd.toISOString(),
          consultationType: rule.consultationType,
          available: true,
        })

        // Move to next slot (slot + buffer)
        current = new Date(current.getTime() + (slotDuration + buffer) * 60000)
      }
    }

    // Check which slots are already booked
    const bookedAppointments = await db
      .select({
        slotStart: appointments.slotStart,
        slotEnd: appointments.slotEnd,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.practitionerId, practitioner.id),
          gte(appointments.slotStart, dayStart),
          lt(appointments.slotEnd, new Date(dayEnd.getTime() + 86400000)),
          // Only count active appointments
          or(
            eq(appointments.status, 'confirmed'),
            eq(appointments.status, 'checked_in'),
            eq(appointments.status, 'in_progress'),
            eq(appointments.status, 'pending_payment'),
            eq(appointments.status, 'pending_verification'),
          )
        )
      )

    // Mark booked slots as unavailable
    for (const slot of allSlots) {
      const slotStart = new Date(slot.start).getTime()
      const slotEnd = new Date(slot.end).getTime()

      for (const booked of bookedAppointments) {
        if (!booked.slotStart || !booked.slotEnd) continue
        const bookedStart = new Date(booked.slotStart).getTime()
        const bookedEnd = new Date(booked.slotEnd).getTime()

        // Check overlap
        if (slotStart < bookedEnd && slotEnd > bookedStart) {
          slot.available = false
          break
        }
      }

      // Also mark past slots as unavailable
      if (new Date(slot.start) <= new Date()) {
        slot.available = false
      }
    }

    return NextResponse.json({
      doctorId: params.id,
      doctorName: practitioner.displayName,
      date: dateStr,
      slots: allSlots,
    })
  } catch (error) {
    console.error('Slots fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available slots' },
      { status: 500 }
    )
  }
}
