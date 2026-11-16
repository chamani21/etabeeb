import { describe, it, expect } from 'vitest'
import { DOSE_OPTIONS, FORM_OPTIONS, FREQUENCY_OPTIONS, TIMING_OPTIONS, formatMedicine, frequencyForPatient, parseDoseCode } from '../rx/medicine'

const line = (m: Parameters<typeof formatMedicine>[0]) => {
  const f = formatMedicine(m)
  return `${f.title}\n${f.details.join(' | ')}`
}

describe('structured medicines — options', () => {
  it('dropdowns in the exact required order', () => {
    expect(FORM_OPTIONS.map((o) => o.label)).toEqual(['Tablet', 'Syrup', 'Cream', 'Inj', 'Other'])
    expect(FREQUENCY_OPTIONS.map((o) => o.code)).toEqual(['OD', 'BD', 'TDS', 'HS', 'WEEKLY', 'OTHER'])
    expect(TIMING_OPTIONS.map((o) => o.label)).toEqual(['Before meal', 'Before breakfast', 'After meal', 'Other'])
    expect(DOSE_OPTIONS.map((o) => o.label)).toEqual(['½ tablet', '1 tablet', '2 tablets', '½ teaspoon', '1 teaspoon', '2 teaspoons', '½ ampule', '1 ampule', '2 ampules', 'Other'])
    expect(parseDoseCode('TEASPOON:0.5')).toEqual({ unit: 'TEASPOON', quantity: '0.5' })
    expect(parseDoseCode('OTHER')).toBeNull()
  })

  it('frequency → patient-facing pattern (one canonical mapping)', () => {
    expect(frequencyForPatient('OD', null)).toBe('1-0-0')
    expect(frequencyForPatient('BD', null)).toBe('1-0-1')
    expect(frequencyForPatient('TDS', null)).toBe('1-1-1')
    expect(frequencyForPatient('HS', null)).toBe('0-0-1')
    expect(frequencyForPatient('WEEKLY', null)).toBe('Once weekly')
    expect(frequencyForPatient('OTHER', 'Every 6 hours')).toBe('Every 6 hours')
    expect(frequencyForPatient('BT', null)).toBeNull() // BT is not a code (BD is)
  })
})

describe('structured medicines — rendering', () => {
  it('spec test 20: Tab. Amoxicillin 500 mg / 1 tablet | 1-1-1 | After meal | 5 days (never "TDS")', () => {
    const out = line({ formCode: 'TABLET', name: 'Amoxicillin', strength: '500 mg', doseQuantity: '1', doseUnit: 'TABLET', frequencyCode: 'TDS', timingCode: 'AFTER_MEAL', duration: '5 days' })
    expect(out).toBe('Tab. Amoxicillin 500 mg\n1 tablet | 1-1-1 | After meal | 5 days')
    expect(out).not.toContain('TDS')
  })

  it('spec test 21: Syp. Paracetamol 120 mg/5 mL / 1 teaspoon | 1-0-1 | After meal | 3 days', () => {
    expect(line({ formCode: 'SYRUP', name: 'Paracetamol', strength: '120 mg/5 mL', doseQuantity: '1', doseUnit: 'TEASPOON', frequencyCode: 'BD', timingCode: 'AFTER_MEAL', duration: '3 days' }))
      .toBe('Syp. Paracetamol 120 mg/5 mL\n1 teaspoon | 1-0-1 | After meal | 3 days')
  })

  it('spec test 22: every "Other" keeps the doctor\'s exact text', () => {
    expect(line({ formCode: 'OTHER', formulation: 'Drops', name: 'Drug X', strength: '10 mg/mL', dose: '3 drops', frequencyCode: 'OTHER', frequency: 'Every 6 hours', timingCode: 'OTHER', timing: 'As needed', duration: '5 days' }))
      .toBe('Drops Drug X 10 mg/mL\n3 drops | Every 6 hours | As needed | 5 days')
  })

  it('form abbreviations; HS, OD, Weekly; ½ and plural doses', () => {
    expect(formatMedicine({ formCode: 'INJECTION', name: 'Ceftriaxone', strength: '1 g', doseQuantity: '1', doseUnit: 'AMPULE', frequencyCode: 'OD' }).title).toBe('Inj. Ceftriaxone 1 g')
    expect(formatMedicine({ formCode: 'CREAM', name: 'Fusidic acid', strength: '2%', frequencyCode: 'HS' })).toMatchObject({ title: 'Cream Fusidic acid 2%', details: ['0-0-1'] })
    expect(formatMedicine({ formCode: 'TABLET', name: 'Vitamin D3', doseQuantity: '0.5', doseUnit: 'TABLET', frequencyCode: 'WEEKLY' }).details).toEqual(['½ tablet', 'Once weekly'])
    expect(formatMedicine({ name: 'X', doseQuantity: '2', doseUnit: 'TEASPOON', frequencyCode: 'OD' }).details).toEqual(['2 teaspoons', '1-0-0'])
  })

  it('older prescriptions (text only, no codes) print exactly as before', () => {
    expect(formatMedicine({ name: 'Paracetamol', strength: '500mg', formulation: 'tablet', dose: '1 tablet', frequency: 'twice daily', timing: 'after meals', duration: '3 days', instructions: 'with water' }))
      .toEqual({ title: 'Paracetamol 500mg tablet', details: ['1 tablet', 'twice daily', 'after meals', '3 days'], instructions: 'with water' })
  })
})
