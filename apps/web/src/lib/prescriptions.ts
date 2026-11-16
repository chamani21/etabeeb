/**
 * Shared prescription creation (existing e-prescription module).
 * Used by POST /api/prescriptions (appointment flow) and by the eTabib V1
 * consultation-case flow, so there is a single prescription system.
 */
import { z } from 'zod'
import { db } from '@etabeeb/db'
import { prescriptions, prescriptionItems } from '@etabeeb/db/schema'
import type { Prescription } from '@etabeeb/db'
import { randomUUID } from 'crypto'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const prescriptionItemSchema = z.object({
  genericName: z.string().min(1),
  strength: z.string().optional(),
  formulation: z.string().optional(),
  route: z.string().optional(),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  timing: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  quantity: z.string().optional(),
  indication: z.string().optional(),
  substitutionAllowed: z.boolean().default(true),
  patientInstructions: z.string().optional(),
  isControlled: z.boolean().default(false),
})

export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>

export async function insertPrescription(
  tx: Tx,
  input: {
    encounterId: string | null
    appointmentId: string | null
    prescribedBy: string
    prescribedForUserId: string | null
    items: PrescriptionItemInput[]
    finalize: boolean
  },
): Promise<Prescription> {
  const verificationToken = randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase()

  const [prescription] = await tx
    .insert(prescriptions)
    .values({
      encounterId: input.encounterId,
      appointmentId: input.appointmentId,
      prescribedBy: input.prescribedBy,
      prescribedForUserId: input.prescribedForUserId,
      verificationToken,
      status: 'active', // Always active once created
      signedAt: input.finalize ? new Date() : null,
      signedBy: input.finalize ? input.prescribedBy : null,
    })
    .returning()

  if (!prescription) {
    throw new Error('Failed to insert prescription')
  }

  let sortOrder = 0
  for (const item of input.items) {
    if (!item) continue
    await tx.insert(prescriptionItems).values({
      prescriptionId: prescription.id,
      genericName: item.genericName,
      strength: item.strength || null,
      formulation: item.formulation || null,
      route: item.route || null,
      dose: item.dose,
      frequency: item.frequency,
      timing: item.timing || null,
      durationDays: item.durationDays || null,
      quantity: item.quantity || null,
      indication: item.indication || null,
      substitutionAllowed: item.substitutionAllowed,
      patientInstructions: item.patientInstructions || null,
      isControlled: item.isControlled,
      sortOrder: sortOrder++,
    })
  }

  return prescription
}
