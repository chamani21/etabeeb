import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { users, patients, roles, userRoles } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import bcryptjs from 'bcryptjs'
import { writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'

/**
 * POST /api/bootstrap-admin
 * Idempotent: creates seed roles + first admin account.
 * Protected by BOOTSTRAP_SECRET env var.
 * Once an administrator exists, this route becomes a no-op.
 * Writes bootstrap credentials to /opt/kozhak/etabeeb/shared/bootstrap-admin.txt (600 perms).
 */
export async function POST(req: NextRequest) {
  try {
    // Guard with bootstrap secret
    const secret = req.headers.get('x-bootstrap-secret')
    const expectedSecret = process.env.BOOTSTRAP_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Seed roles (idempotent)
    const roleNames = ['patient', 'practitioner', 'administrator'] as const
    const roleRecords: Record<string, string> = {}

    for (const name of roleNames) {
      const existing = await db.select().from(roles).where(eq(roles.name, name as any)).limit(1)
      if (existing[0]) {
        roleRecords[name] = existing[0].id
      } else {
        const [inserted] = await db.insert(roles).values({ name: name as any }).returning()
        if (inserted) roleRecords[name] = inserted.id
      }
    }

    // Check if admin already exists
    const adminRoleId = roleRecords['administrator']
    if (!adminRoleId) {
      return NextResponse.json({ error: 'Failed to create administrator role' }, { status: 500 })
    }

    const existingAdmins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, adminRoleId))
      .limit(1)

    if (existingAdmins.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Roles seeded. Administrator already exists — no changes made.',
        rolesCreated: Object.keys(roleRecords),
      })
    }

    // Generate admin credentials
    const adminPhone = process.env.BOOTSTRAP_ADMIN_PHONE || '+93700000001'
    const adminPassword = randomBytes(16).toString('hex')
    const passwordHash = await bcryptjs.hash(adminPassword, 12)

    const result = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        phoneE164: adminPhone,
        displayName: 'System Administrator',
        passwordHash,
        preferredLocale: 'en',
      }).returning()

      if (!user) throw new Error('Failed to create admin user')

      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: adminRoleId,
      })

      return user
    })

    // Write credentials to protected file (never return in response)
    const credContent = [
      `eTabeeb Bootstrap Admin Credentials`,
      `Created: ${new Date().toISOString()}`,
      `Phone: ${adminPhone}`,
      `Password: ${adminPassword}`,
      ``,
      `KEEP THIS FILE SECURE. DELETE AFTER FIRST LOGIN AND CHANGE PASSWORD.`,
    ].join('\n')

    try {
      await writeFile('/opt/kozhak/etabeeb/shared/bootstrap-admin.txt', credContent, { mode: 0o600 })
    } catch (fileError) {
      console.error('Failed to write bootstrap-admin.txt:', fileError)
      // Don't fail the whole operation, just log it
    }

    return NextResponse.json({
      success: true,
      message: 'Bootstrap complete. Roles seeded. Admin created. Credentials written to bootstrap-admin.txt.',
      rolesCreated: Object.keys(roleRecords),
      adminPhone,
    }, { status: 201 })
  } catch (error) {
    console.error('Bootstrap error:', error)
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 })
  }
}
