/** Clinic-time helpers. The clinic runs on Pakistan time (UTC+5, no DST). */
export const CLINIC_TZ = 'Asia/Karachi'

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** `<input type="datetime-local">` value (clinic time) → ISO with +05:00 offset. */
export function clinicLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  return `${local}:00+05:00`
}

/** ISO → `datetime-local` value in clinic time. */
export function isoToClinicLocal(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const shifted = new Date(d.getTime() + 5 * 3600_000)
  return shifted.toISOString().slice(0, 16)
}

export const shortId = (id: string) => id.slice(0, 8)
