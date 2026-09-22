'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface AppointmentDetails {
  id: string
  publicId: string
  slotStart: string
  status: string
  consultationType: string
  chiefComplaint?: string
  patientName?: string
  practitionerName?: string
}

interface EncounterData {
  id?: string
  subjective: string
  objective: string
  assessment: string
  plan: string
  safetyNet: string
  followUpDays?: number
  status?: string
}

interface PrescriptionItem {
  genericName: string
  strength: string
  formulation: string
  dose: string
  frequency: string
  timing: string
  durationDays?: number
  patientInstructions: string
}

export default function ConsultationPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const appointmentId = params?.id as string
  const router = useRouter()
  const { data: session } = useSession()
  const isDoctor = session?.user?.role === 'practitioner' || session?.user?.role === 'administrator'

  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null)
  const [encounter, setEncounter] = useState<EncounterData>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    safetyNet: '',
  })
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'notes' | 'prescription' | 'video'>('video')
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([{
    genericName: '',
    strength: '',
    formulation: '',
    dose: '',
    frequency: '',
    timing: '',
    patientInstructions: '',
  }])
  const [prescriptionSaving, setPrescriptionSaving] = useState(false)
  const [prescriptionMsg, setPrescriptionMsg] = useState('')
  const [videoToken, setVideoToken] = useState<string | null>(null)
  const [videoError, setVideoError] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  // Fetch appointment details
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/appointments?publicId=${appointmentId}`)
        if (!res.ok) return
        const data = await res.json()
        const appt = data.appointments?.[0]
        if (appt) setAppointment(appt)

        // Fetch existing encounter
        if (appt?.id) {
          const encRes = await fetch(`/api/encounters?appointmentId=${appt.id}`)
          if (encRes.ok) {
            const encData = await encRes.json()
            const existingEnc = encData.encounters?.[0]
            if (existingEnc) {
              setEncounterId(existingEnc.id)
              setEncounter({
                subjective: existingEnc.subjective || '',
                objective: existingEnc.objective || '',
                assessment: existingEnc.assessment || '',
                plan: existingEnc.plan || '',
                safetyNet: existingEnc.safetyNet || '',
                followUpDays: existingEnc.followUpDays || undefined,
                status: existingEnc.status,
              })
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [appointmentId])

  // Get LiveKit video token
  useEffect(() => {
    if (!appointmentId) return
    fetch('/api/video/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.token) setVideoToken(d.token)
        else setVideoError(d.error || 'Video not available')
      })
      .catch(() => setVideoError('Video unavailable'))
  }, [appointmentId])

  const handleSaveNotes = async (sign = false) => {
    if (!appointment?.id) return
    setSaving(true)
    setSaveMsg('')
    try {
      let res
      if (encounterId) {
        res = await fetch('/api/encounters', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encounterId, ...encounter, sign }),
        })
      } else {
        res = await fetch('/api/encounters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: appointment.id, ...encounter, sign }),
        })
      }
      const data = await res.json()
      if (res.ok) {
        if (data.encounter?.id) setEncounterId(data.encounter.id)
        setSaveMsg(sign ? '✓ Notes signed' : '✓ Saved')
        if (sign) setEncounter(prev => ({ ...prev, status: 'signed' }))
      } else {
        setSaveMsg('Error: ' + (data.error || 'Failed to save'))
      }
    } catch {
      setSaveMsg('Error saving notes')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const handlePrescriptionSubmit = async () => {
    if (!appointment?.id || !encounterId) {
      setPrescriptionMsg('Please save consultation notes first before prescribing')
      return
    }
    // Get patient user ID from appointment
    const patientUserId = (appointment as any).patientUserId
    if (!patientUserId) {
      setPrescriptionMsg('Cannot determine patient ID from appointment')
      return
    }
    const validItems = prescriptionItems.filter(i => i.genericName && i.dose && i.frequency)
    if (validItems.length === 0) {
      setPrescriptionMsg('Add at least one medication')
      return
    }
    setPrescriptionSaving(true)
    setPrescriptionMsg('')
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encounterId,
          appointmentId: appointment.id,
          patientUserId,
          items: validItems,
          finalize: true,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setPrescriptionMsg(`✓ Prescription created. Token: ${data.prescription?.verificationToken}`)
        // Also update appointment status to completed
        await fetch('/api/appointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: appointment.id, status: 'completed' }),
        })
      } else {
        setPrescriptionMsg('Error: ' + (data.error || 'Failed to create prescription'))
      }
    } catch {
      setPrescriptionMsg('Error creating prescription')
    } finally {
      setPrescriptionSaving(false)
    }
  }

  const addMedication = () => {
    setPrescriptionItems(prev => [...prev, {
      genericName: '', strength: '', formulation: '', dose: '', frequency: '', timing: '', patientInstructions: '',
    }])
  }

  const removeMedication = (index: number) => {
    setPrescriptionItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateMedication = (index: number, field: keyof PrescriptionItem, value: string) => {
    setPrescriptionItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#00523a]">
            {locale === 'ps' ? 'کنسلټیشن' : locale === 'ur' ? 'کنسلٹیشن' : 'Consultation'}
          </h1>
          {appointment && (
            <p className="text-sm text-gray-500">
              {new Date(appointment.slotStart).toLocaleString()} · {appointment.status}
              {appointment.chiefComplaint ? ` · ${appointment.chiefComplaint}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← {locale === 'ps' ? 'بیرته' : 'Back'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(isDoctor
          ? [{ id: 'video', label: locale === 'ps' ? 'ویډیو' : 'Video' },
             { id: 'notes', label: locale === 'ps' ? 'نوټونه' : 'Notes' },
             { id: 'prescription', label: locale === 'ps' ? 'نسخه' : 'Prescription' }]
          : [{ id: 'video', label: locale === 'ps' ? 'ویډیو' : 'Video' }]
        ).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.id ? 'bg-white shadow text-[#00523a]' : 'text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Video Tab */}
      {activeTab === 'video' && (
        <div className="bg-gray-900 rounded-xl overflow-hidden" style={{ minHeight: '400px' }}>
          {videoError ? (
            <div className="flex flex-col items-center justify-center h-64 text-white">
              <svg className="w-12 h-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-400 text-sm mb-2">
                {locale === 'ps' ? 'ویډیو کانفرنس شتون نلري' : 'Video conferencing not configured'}
              </p>
              <p className="text-gray-500 text-xs">{videoError}</p>
              <div className="mt-4 bg-gray-800 rounded-lg p-4 text-center">
                <p className="text-white text-sm font-medium mb-1">
                  {locale === 'ps' ? 'د وخت معلومات' : 'Appointment Details'}
                </p>
                {appointment && (
                  <>
                    <p className="text-gray-300 text-xs">{new Date(appointment.slotStart).toLocaleString()}</p>
                    <p className="text-gray-300 text-xs mt-1">
                      {locale === 'ps' ? 'د تلیفون له لارې اړیکه ونیسئ' : 'Please connect via phone call'}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : videoToken ? (
            <div className="flex flex-col items-center justify-center h-64 text-white">
              <div className="w-16 h-16 bg-[#006d4e] rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">
                {locale === 'ps' ? 'ویډیو چمتو دی' : 'Video Ready'}
              </p>
              <p className="text-gray-400 text-xs">
                {locale === 'ps' ? 'LiveKit کانفرنس فعاله ده' : 'LiveKit conference active'}
              </p>
              {/* LiveKit component would go here with the token */}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Video Controls */}
          <div className="flex items-center justify-center gap-4 p-4 bg-gray-800">
            <button
              onClick={() => setMicOn(!micOn)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition ${micOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {micOn
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />}
              </svg>
            </button>
            <button
              onClick={() => {
                // Mark completed and go back
                if (appointment?.id && isDoctor) {
                  fetch('/api/appointments', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ appointmentId: appointment.id, status: 'completed' }),
                  }).catch(() => {})
                }
                router.back()
              }}
              className="w-14 h-14 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition"
            >
              <svg className="w-7 h-7 transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            <button
              onClick={() => setCamOn(!camOn)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition ${camOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {camOn
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />}
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Notes Tab (Doctor only) */}
      {activeTab === 'notes' && isDoctor && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#00523a]">
              {locale === 'ps' ? 'SOAP نوټونه' : 'SOAP Notes'}
            </h2>
            {encounter.status === 'signed' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✓ Signed</span>
            )}
          </div>

          {[
            { key: 'subjective', label: 'S — Subjective', placeholder: "Patient's own description of symptoms..." },
            { key: 'objective', label: 'O — Objective', placeholder: 'Examination findings, vitals...' },
            { key: 'assessment', label: 'A — Assessment', placeholder: 'Diagnosis / clinical impression...' },
            { key: 'plan', label: 'P — Plan', placeholder: 'Treatment plan, referrals, investigations...' },
            { key: 'safetyNet', label: 'Safety Net', placeholder: 'Warning signs the patient should watch for...' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              <textarea
                rows={3}
                value={(encounter as any)[field.key] || ''}
                onChange={e => setEncounter(prev => ({ ...prev, [field.key]: e.target.value }))}
                disabled={encounter.status === 'signed'}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-[#00523a] resize-none disabled:bg-gray-50 disabled:text-gray-500"
                placeholder={field.placeholder}
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {locale === 'ps' ? 'د فالو اپ ورځې' : 'Follow-up Days'}
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={encounter.followUpDays ?? ''}
              onChange={e => {
                const val = parseInt(e.target.value)
                setEncounter(prev => ({ ...prev, followUpDays: isNaN(val) ? 0 : val }))
              }}
              disabled={encounter.status === 'signed'}
              className="border border-gray-200 rounded-lg p-2 text-sm w-32 focus:outline-none focus:border-[#00523a] disabled:bg-gray-50"
              placeholder="e.g. 7"
            />
          </div>

          {saveMsg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {saveMsg}
            </div>
          )}

          {encounter.status !== 'signed' && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleSaveNotes(false)}
                disabled={saving}
                className="flex-1 border border-[#00523a] text-[#00523a] py-2 rounded-lg text-sm font-medium hover:bg-[#e6fff6] transition disabled:opacity-50"
              >
                {saving ? '...' : (locale === 'ps' ? 'خوندي کول' : 'Save Draft')}
              </button>
              <button
                onClick={() => handleSaveNotes(true)}
                disabled={saving}
                className="flex-1 bg-[#00523a] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition disabled:opacity-50"
              >
                {saving ? '...' : (locale === 'ps' ? 'لاسلیک کول' : 'Sign & Finalize')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Prescription Tab (Doctor only) */}
      {activeTab === 'prescription' && isDoctor && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#00523a]">
              {locale === 'ps' ? 'نسخه' : 'Prescription'}
            </h2>
            {!encounterId && (
              <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded">
                {locale === 'ps' ? 'لومړی نوټونه خوندي کړئ' : 'Save notes first'}
              </span>
            )}
          </div>

          {prescriptionItems.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  {locale === 'ps' ? 'دوا' : 'Medication'} {index + 1}
                </h3>
                {prescriptionItems.length > 1 && (
                  <button
                    onClick={() => removeMedication(index)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {locale === 'ps' ? 'د دوا نوم *' : 'Generic Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={item.genericName}
                    onChange={e => updateMedication(index, 'genericName', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                    placeholder="e.g. Paracetamol"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Strength</label>
                  <input
                    type="text"
                    value={item.strength}
                    onChange={e => updateMedication(index, 'strength', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                    placeholder="500mg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {locale === 'ps' ? 'خوراک *' : 'Dose *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={item.dose}
                    onChange={e => updateMedication(index, 'dose', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                    placeholder="1 tablet"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {locale === 'ps' ? 'وخت *' : 'Frequency *'}
                  </label>
                  <select
                    value={item.frequency}
                    onChange={e => updateMedication(index, 'frequency', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  >
                    <option value="">Select...</option>
                    <option value="once daily">Once daily</option>
                    <option value="twice daily">Twice daily</option>
                    <option value="three times daily">Three times daily</option>
                    <option value="four times daily">Four times daily</option>
                    <option value="as needed">As needed</option>
                    <option value="at night">At night</option>
                    <option value="morning">Morning</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Timing</label>
                  <select
                    value={item.timing}
                    onChange={e => updateMedication(index, 'timing', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  >
                    <option value="">Select...</option>
                    <option value="before meals">Before meals</option>
                    <option value="after meals">After meals</option>
                    <option value="with meals">With meals</option>
                    <option value="empty stomach">Empty stomach</option>
                    <option value="at bedtime">At bedtime</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Formulation</label>
                  <select
                    value={item.formulation}
                    onChange={e => updateMedication(index, 'formulation', e.target.value)}
                    className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  >
                    <option value="">Select...</option>
                    <option value="tablet">Tablet</option>
                    <option value="capsule">Capsule</option>
                    <option value="syrup">Syrup</option>
                    <option value="injection">Injection</option>
                    <option value="cream">Cream</option>
                    <option value="drops">Drops</option>
                    <option value="inhaler">Inhaler</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Patient Instructions</label>
                <input
                  type="text"
                  value={item.patientInstructions}
                  onChange={e => updateMedication(index, 'patientInstructions', e.target.value)}
                  className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  placeholder="Any special instructions for patient..."
                />
              </div>
            </div>
          ))}

          <button
            onClick={addMedication}
            className="w-full border-2 border-dashed border-[#DDE7E2] rounded-lg py-3 text-sm text-[#5D6F69] hover:border-[#00523a] hover:text-[#00523a] transition"
          >
            + {locale === 'ps' ? 'نوره دوا زیاته کړئ' : 'Add Another Medication'}
          </button>

          {prescriptionMsg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${prescriptionMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {prescriptionMsg}
            </div>
          )}

          <button
            onClick={handlePrescriptionSubmit}
            disabled={prescriptionSaving || !encounterId}
            className="w-full bg-[#00523a] text-white py-3 rounded-xl font-semibold hover:bg-[#006d4e] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {prescriptionSaving ? '...' : (locale === 'ps' ? 'نسخه خپرول' : 'Issue Prescription')}
          </button>
        </div>
      )}
    </div>
  )
}
