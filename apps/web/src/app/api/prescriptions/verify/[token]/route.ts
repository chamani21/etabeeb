import { NextRequest, NextResponse } from 'next/server'

// GET /api/prescriptions/verify/[token] — Public prescription verification
// This is the QR code endpoint — pharmacies scan to verify authenticity
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { db } = await import('@etabeeb/db')
    const { prescriptions, prescriptionItems, prescriptionVerifications, practitioners, users } = await import('@etabeeb/db/schema')
    const { eq } = await import('drizzle-orm')

    // Find prescription by verification token
    const [prescription] = await db
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.verificationToken, params.token))
      .limit(1)

    if (!prescription) {
      return NextResponse.json(
        {
          verified: false,
          error: 'Prescription not found or invalid verification code',
        },
        { status: 404 }
      )
    }

    // Get prescriber info
    const [prescriber] = await db
      .select({
        displayName: users.displayName,
        phone: users.phoneE164,
      })
      .from(users)
      .where(eq(users.id, prescription.prescribedBy))
      .limit(1)

    // Get items (medications)
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

    // Return SAFE verification data — NO full patient records
    return NextResponse.json({
      verified: true,
      prescription: {
        prescriptionNumber: prescription.publicId,
        status: prescription.status,
        prescribedAt: prescription.createdAt,
        signedAt: prescription.signedAt,
        expiresAt: prescription.expiresAt,
        prescriber: {
          name: prescriber?.displayName || 'Unknown',
        },
        medications: items.map(item => ({
          name: item.genericName,
          strength: item.strength,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.durationDays ? `${item.durationDays} days` : null,
          substitutionAllowed: item.substitutionAllowed,
        })),
        documentHash: prescription.documentHash,
        // NOTE: Patient name intentionally NOT included in public verification
        // Pharmacy should verify identity in person
      },
    })
  } catch (error) {
    console.error('Prescription verification error:', error)
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}
