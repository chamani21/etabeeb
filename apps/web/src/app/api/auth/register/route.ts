import { NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { users, patients, userRoles, roles } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import bcryptjs from 'bcryptjs'
import { z } from 'zod'

const registerSchema = z.object({
  phone: z.string().min(5),
  password: z.string().min(6),
  displayName: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = registerSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input data' }, { status: 400 })
    }

    const { phone, password, displayName, email } = result.data

    const existingUser = await db.select().from(users).where(eq(users.phoneE164, phone))
    
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
    }

    const passwordHash = await bcryptjs.hash(password, 10)

    const newUser = await db.transaction(async (tx) => {
      const inserted = await tx.insert(users).values({
        phoneE164: phone,
        passwordHash,
        displayName,
        email: email || null,
      }).returning()
      
      const user = inserted[0]
      if (!user) throw new Error('Failed to create user')

      await tx.insert(patients).values({
        userId: user.id,
        givenName: displayName.split(' ')[0] || displayName,
        familyName: displayName.split(' ').slice(1).join(' ') || null,
      })

      // Get or create patient role
      const existingRole = await tx.select().from(roles).where(eq(roles.name, 'patient'))
      let roleId = existingRole[0]?.id
      
      if (!roleId) {
        const newRoles = await tx.insert(roles).values({ name: 'patient' as any }).returning()
        const newRole = newRoles[0]
        if (!newRole) throw new Error('Failed to create role')
        roleId = newRole.id
      }

      await tx.insert(userRoles).values({
        userId: user.id,
        roleId,
      })

      return user
    })

    return NextResponse.json({ success: true, userId: newUser.id }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
