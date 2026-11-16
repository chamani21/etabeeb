/**
 * eTabib V1 — canonical prescription document (the single source of truth for
 * every rendering). Built from the database rows; the renderer turns it into
 * the same paged stationery for both the WhatsApp image(s) and the PDF.
 */
import type { MedicineLike } from './medicine'

export type RxMedicine = MedicineLike

export interface RxVitals {
  weight?: string | null | undefined
  bp?: string | null | undefined
  pulse?: string | null | undefined
  temperature?: string | null | undefined
  respiratoryRate?: string | null | undefined
}

export interface RxDoctor {
  nameEn: string
  credentialsEn: string[]
  namePs: string
  credentialsPs: string[]
}

export interface RxDocument {
  rxNumber: string
  revision: number
  status: 'DRAFT' | 'FINALIZED' | 'SUPERSEDED'
  issuedAt: Date
  doctor: RxDoctor
  patient: {
    name: string | null
    age: number | null
    sex: 'MALE' | 'FEMALE' | null
    location: string | null
    caseRef: string
  }
  vitals: RxVitals
  complaint: string | null
  diagnosis: string | null
  medicines: RxMedicine[]
  freeText: string | null
  investigations: string | null
  advice: string | null
  followUp: string | null
  followUpInterval: string | null
  redFlags: string | null
  /** Public verification URL encoded in the QR code (no clinical data behind it). */
  verifyUrl: string | null
  contact: { whatsappDisplay: string; website: string }
}

/** Fixed eTabeeb contact details printed on every prescription (source of truth). */
export const ETABEEB_CONTACT = { whatsappDisplay: '0310 000 6526', website: 'etabeeb.online' } as const

/**
 * Dr. Jalaluddin's approved stationery identity. Used when the practitioner
 * profile has no prescription-specific credentials. Do not add qualifications.
 */
export const DR_JALALUDDIN: RxDoctor = {
  nameEn: 'Dr Jalal-ud-din "Jalal"',
  credentialsEn: [
    'MBBS, RMP, Family Medicine, MD',
    'Family Medicine (Aga Khan Hospital)',
    'MD (Internal Medicine) PGMI',
    'Medical Officer, DHQ Hospital Chaman',
    'PGR, BMC, Quetta',
  ],
  namePs: 'ډاکټر جلال الدین «جلال»',
  credentialsPs: [
    'ایم بي بي ایس، آر ایم پي، فیملي میډیسن، ایم ډي',
    'فیملي میډیسن (آغا خان روغتون)',
    'ایم ډي (داخله طب) PGMI',
    'میډیکل افسر، DHQ روغتون چمن',
    'پي جي آر، BMC، کوټه',
  ],
}
