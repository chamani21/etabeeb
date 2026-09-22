'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Doctor {
  id: string
  displayName: string
  displayNameUrdu?: string
  displayNamePashto?: string
  specialty: string
  specialtyUrdu?: string
  specialtyPashto?: string
  qualifications?: string
  consultationFee?: number
  telemedicineEligible: boolean
}

interface Slot {
  start: string
  end: string
}

type Step = 'select-doctor' | 'select-slot' | 'chief-complaint' | 'confirm'

export default function BookAppointmentPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const router = useRouter()

  const [step, setStep] = useState<Step>('select-doctor')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(true)
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [consultationType, setConsultationType] = useState<'video' | 'audio'>('video')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [booking, setBooking] = useState(false)
  const [bookingError, setBookingError] = useState('')

  // Load doctors
  useEffect(() => {
    fetch('/api/doctors')
      .then(r => r.json())
      .then(d => setDoctors(d.doctors || []))
      .catch(() => setDoctors([]))
      .finally(() => setLoadingDoctors(false))
  }, [])

  // Load slots when date + doctor selected
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) {
      setSlots([])
      return
    }
    setLoadingSlots(true)
    fetch(`/api/doctors/${selectedDoctor.id}/slots?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setSlots(d.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDoctor, selectedDate])

  const doctorName = (d: Doctor) => {
    if (locale === 'ur' && d.displayNameUrdu) return d.displayNameUrdu
    if (locale === 'ps' && d.displayNamePashto) return d.displayNamePashto
    return d.displayName
  }

  const doctorSpecialty = (d: Doctor) => {
    if (locale === 'ur' && d.specialtyUrdu) return d.specialtyUrdu
    if (locale === 'ps' && d.specialtyPashto) return d.specialtyPashto
    return d.specialty
  }

  const handleBooking = async () => {
    if (!selectedDoctor || !selectedSlot) return
    setBooking(true)
    setBookingError('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practitionerId: selectedDoctor.id,
          slotStart: selectedSlot.start,
          slotEnd: selectedSlot.end,
          consultationType,
          chiefComplaint: chiefComplaint.trim() || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kabul',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push(`/${locale}/patient/appointments`)
      } else {
        setBookingError(data.error || 'Booking failed')
      }
    } catch {
      setBookingError(locale === 'ps' ? 'ستونزه رامنځته شوه' : 'An error occurred')
    } finally {
      setBooking(false)
    }
  }

  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().split('T')[0]

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => {
          if (step === 'select-slot') setStep('select-doctor')
          else if (step === 'chief-complaint') setStep('select-slot')
          else if (step === 'confirm') setStep('chief-complaint')
          else router.push(`/${locale}/patient/appointments`)
        }} className="p-2 rounded-full hover:bg-white/50 transition">
          <svg className="w-5 h-5 text-[#05201a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-[#05201a]">
          {locale === 'ps' ? 'وخت ورکول' : locale === 'ur' ? 'وقت بک کریں' : 'Book Appointment'}
        </h1>
      </div>

      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {(['select-doctor', 'select-slot', 'chief-complaint', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${
            step === s ? 'bg-[#00523a]' :
            (['select-doctor', 'select-slot', 'chief-complaint', 'confirm'] as Step[]).indexOf(step) > i
              ? 'bg-[#006d4e]/60' : 'bg-[#DDE7E2]'
          }`} />
        ))}
      </div>

      {/* Step 1: Select Doctor */}
      {step === 'select-doctor' && (
        <div>
          <h2 className="font-bold text-[#00523a] mb-4">
            {locale === 'ps' ? 'ډاکټر غوره کړئ' : locale === 'ur' ? 'ڈاکٹر منتخب کریں' : 'Select Doctor'}
          </h2>
          {loadingDoctors ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : doctors.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-xl border border-[#DDE7E2]">
              <p className="text-[#5D6F69]">
                {locale === 'ps' ? 'اوس مهال هیڅ ډاکټر شتون نلري' : 'No doctors available'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map(doctor => (
                <button
                  key={doctor.id}
                  onClick={() => { setSelectedDoctor(doctor); setStep('select-slot') }}
                  className="w-full text-left bg-white rounded-xl border border-[#DDE7E2] p-4 hover:border-[#00523a] hover:bg-[#f0faf5] transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#006d4e]/10 text-[#006d4e] rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      {doctorName(doctor)[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#05201a] text-sm">{doctorName(doctor)}</h3>
                      <p className="text-xs text-[#5D6F69]">{doctorSpecialty(doctor)}</p>
                      {doctor.qualifications && (
                        <p className="text-xs text-[#5D6F69]">{doctor.qualifications}</p>
                      )}
                      {doctor.consultationFee && (
                        <p className="text-xs font-semibold text-[#00523a] mt-1">
                          {(doctor.consultationFee / 100).toFixed(0)} PKR
                        </p>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-[#5D6F69] ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Date & Slot */}
      {step === 'select-slot' && selectedDoctor && (
        <div>
          <h2 className="font-bold text-[#00523a] mb-1">
            {locale === 'ps' ? 'نیټه او وخت' : locale === 'ur' ? 'تاریخ اور وقت' : 'Select Date & Time'}
          </h2>
          <p className="text-sm text-[#5D6F69] mb-4">{doctorName(selectedDoctor)}</p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-[#05201a] mb-1">
              {locale === 'ps' ? 'نیټه' : locale === 'ur' ? 'تاریخ' : 'Date'}
            </label>
            <input
              type="date"
              min={minDateStr}
              value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null) }}
              className="w-full border border-[#DDE7E2] rounded-lg p-2.5 focus:outline-none focus:border-[#00523a] text-sm"
            />
          </div>

          {selectedDate && (
            <div>
              <p className="text-sm font-medium text-[#05201a] mb-2">
                {locale === 'ps' ? 'شته وختونه' : locale === 'ur' ? 'دستیاب اوقات' : 'Available Slots'}
              </p>
              {loadingSlots ? (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-center text-[#5D6F69] text-sm py-4">
                  {locale === 'ps' ? 'پدې نیټه شته وخت نشته' : 'No available slots on this date'}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border transition ${
                        selectedSlot?.start === slot.start
                          ? 'bg-[#00523a] text-white border-[#00523a]'
                          : 'bg-white text-[#05201a] border-[#DDE7E2] hover:border-[#00523a]'
                      }`}
                    >
                      {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedSlot && (
            <button
              onClick={() => setStep('chief-complaint')}
              className="w-full mt-6 bg-[#00523a] text-white py-3 rounded-xl font-semibold hover:bg-[#006d4e] transition"
            >
              {locale === 'ps' ? 'دوام' : locale === 'ur' ? 'آگے بڑھیں' : 'Continue'}
            </button>
          )}
        </div>
      )}

      {/* Step 3: Chief Complaint */}
      {step === 'chief-complaint' && (
        <div>
          <h2 className="font-bold text-[#00523a] mb-1">
            {locale === 'ps' ? 'د ناروغۍ تفصیل' : locale === 'ur' ? 'بیماری کی تفصیل' : 'What is your main concern?'}
          </h2>
          <p className="text-sm text-[#5D6F69] mb-4">
            {locale === 'ps' ? 'مختصر تفصیل ولیکئ' : 'Briefly describe your symptoms'}
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-[#05201a] mb-1">
              {locale === 'ps' ? 'د مشوري ډول' : locale === 'ur' ? 'مشاورت کی قسم' : 'Consultation Type'}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setConsultationType('video')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                  consultationType === 'video'
                    ? 'bg-[#00523a] text-white border-[#00523a]'
                    : 'bg-white text-[#05201a] border-[#DDE7E2]'
                }`}
              >
                📹 {locale === 'ps' ? 'ویډیو' : 'Video'}
              </button>
              <button
                onClick={() => setConsultationType('audio')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                  consultationType === 'audio'
                    ? 'bg-[#00523a] text-white border-[#00523a]'
                    : 'bg-white text-[#05201a] border-[#DDE7E2]'
                }`}
              >
                📞 {locale === 'ps' ? 'اوډیو' : 'Audio'}
              </button>
            </div>
          </div>

          <textarea
            value={chiefComplaint}
            onChange={e => setChiefComplaint(e.target.value)}
            placeholder={
              locale === 'ps' ? 'ستاسو ناروغي یا ستونزه لنډه بیان کړئ...' :
              locale === 'ur' ? 'اپنی تکلیف مختصراً بیان کریں...' :
              'Briefly describe your symptoms or concern...'
            }
            rows={4}
            className="w-full border border-[#DDE7E2] rounded-lg p-3 text-sm focus:outline-none focus:border-[#00523a] resize-none"
            maxLength={500}
          />
          <p className="text-xs text-[#5D6F69] text-right mt-1">{chiefComplaint.length}/500</p>

          <button
            onClick={() => setStep('confirm')}
            className="w-full mt-4 bg-[#00523a] text-white py-3 rounded-xl font-semibold hover:bg-[#006d4e] transition"
          >
            {locale === 'ps' ? 'دوام' : locale === 'ur' ? 'آگے بڑھیں' : 'Continue'}
          </button>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && selectedDoctor && selectedSlot && (
        <div>
          <h2 className="font-bold text-[#00523a] mb-4">
            {locale === 'ps' ? 'تصدیق' : locale === 'ur' ? 'تصدیق کریں' : 'Confirm Booking'}
          </h2>

          <div className="bg-white rounded-xl border border-[#DDE7E2] p-4 space-y-3 mb-4">
            <div className="flex justify-between">
              <span className="text-sm text-[#5D6F69]">
                {locale === 'ps' ? 'ډاکټر' : 'Doctor'}
              </span>
              <span className="text-sm font-medium text-[#05201a]">{doctorName(selectedDoctor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#5D6F69]">
                {locale === 'ps' ? 'ځانګړتیا' : 'Specialty'}
              </span>
              <span className="text-sm font-medium text-[#05201a]">{doctorSpecialty(selectedDoctor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#5D6F69]">
                {locale === 'ps' ? 'نیټه او وخت' : 'Date & Time'}
              </span>
              <span className="text-sm font-medium text-[#05201a]">
                {new Date(selectedSlot.start).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-PK', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#5D6F69]">
                {locale === 'ps' ? 'ډول' : 'Type'}
              </span>
              <span className="text-sm font-medium text-[#05201a]">
                {consultationType === 'video' ? '📹 Video' : '📞 Audio'}
              </span>
            </div>
            {chiefComplaint && (
              <div>
                <span className="text-sm text-[#5D6F69] block mb-1">
                  {locale === 'ps' ? 'ناروغي' : 'Concern'}
                </span>
                <p className="text-sm text-[#05201a] bg-[#f0faf5] rounded-lg p-2">{chiefComplaint}</p>
              </div>
            )}
            {selectedDoctor.consultationFee && (
              <div className="flex justify-between border-t border-[#DDE7E2] pt-3 mt-1">
                <span className="text-sm font-bold text-[#05201a]">
                  {locale === 'ps' ? 'ټول فیس' : 'Total Fee'}
                </span>
                <span className="text-sm font-bold text-[#00523a]">
                  {(selectedDoctor.consultationFee / 100).toFixed(0)} PKR
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
            {locale === 'ps'
              ? 'مهرباني وکړئ د ډاکټر سره د خبرو پر مهال د پیسو ادا کولو لپاره چمتو اوسئ. تادیه مستقیم د ډاکټر سره ترسره کیږي.'
              : 'Payment to be made directly to the doctor. Manual payment verification by admin may be required.'}
          </div>

          {bookingError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {bookingError}
            </div>
          )}

          <button
            onClick={handleBooking}
            disabled={booking}
            className="w-full bg-[#00523a] text-white py-3 rounded-xl font-bold hover:bg-[#006d4e] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {booking ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {locale === 'ps' ? 'روان دی...' : 'Booking...'}
              </>
            ) : (
              locale === 'ps' ? 'وخت تایید کړئ' : locale === 'ur' ? 'بک کریں' : 'Confirm Booking'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
