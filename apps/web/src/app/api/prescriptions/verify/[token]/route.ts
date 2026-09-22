import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { prescriptions, prescriptionItems, prescriptionVerifications, users } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'

// GET /api/prescriptions/verify/[token] — Public prescription verification
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const results = await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.verificationToken, params.token))
      .limit(1)

    const prescription = results[0]
    if (!prescription) {
      return NextResponse.json(
        { verified: false, error: 'Prescription not found or invalid verification code' },
        { status: 404 }
      )
    }

    // Get prescriber info
    const prescriberResults = await db
      .select({ displayName: users.displayName, phone: users.phoneE164 })
      .from(users)
      .where(eq(users.id, prescription.prescribedBy))
      .limit(1)

    const prescriber = prescriberResults[0]

    // Get items
    const items = await db
      .select()
      .from(prescriptionItems)
      .where(eq(prescriptionItems.prescriptionId, prescription.id))

    // Record verification attempt
    await db.insert(prescriptionVerifications).values({
      prescriptionId: prescription.id,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    })

    return NextResponse.json({
      verified: true,
      prescription: {
        prescriptionNumber: prescription.publicId,
        status: prescription.status,
        prescribedAt: prescription.createdAt,
        signedAt: prescription.signedAt,
        expiresAt: prescription.expiresAt,
        prescriber: { name: prescriber?.displayName || 'Unknown' },
        medications: items.map(item => ({
          name: item.genericName,
          strength: item.strength,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.durationDays ? `${item.durationDays} days` : null,
          substitutionAllowed: item.substitutionAllowed,
        })),
        documentHash: prescription.documentHash,
      },
    })
  } catch (error) {
    console.error('Prescription verification error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
