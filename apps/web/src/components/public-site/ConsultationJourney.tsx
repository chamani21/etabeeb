'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ClipboardList,
  FileText,
  MessageCircle,
  Paperclip,
  UserRound,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import styles from './public-site.module.css'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const steps: { title: string; summary: string; preview: string; Icon: LucideIcon }[] = [
  {
    title: 'په واټس‌اپ پیغام واستوئ',
    summary: 'د ناروغ نوم ولیکئ؛ د واټس‌اپ شمېره مو له پیغام سره پېژندل کېږي.',
    preview: 'لومړی پیغام',
    Icon: MessageCircle,
  },
  {
    title: 'استازی معلومات بشپړوي',
    summary: 'استازی اړین معلومات اخلي او زاړه راپورونه یا نسخې ترلاسه کوي.',
    preview: 'معلومات او فایلونه',
    Icon: Paperclip,
  },
  {
    title: 'د فیس لاره تایید کړئ',
    summary: 'فیس او د پیسو ورکړې لاره له استازي سره تایید کړئ؛ استازی د ورکړې ترلاسه کېدل هم درسره روښانوي.',
    preview: 'د ورکړې تایید',
    Icon: BadgeCheck,
  },
  {
    title: 'د مشورې وخت تاییدېږي',
    summary: 'ډاکټر د مشورې وخت تاییدوي او استازی یې درته په واټس‌اپ کې لېږي.',
    preview: 'د وخت خبرتیا',
    Icon: CalendarCheck,
  },
  {
    title: 'په ټاکلي وخت مشوره وکړئ',
    summary: 'د eTabeeb د مشورې لینک پرانیزئ او له ډاکټر سره خبرې وکړئ. زنګ د eTabeeb پاڼه کې کېږي.',
    preview: 'د مشورې لینک',
    Icon: Video,
  },
  {
    title: 'نسخه په واټس‌اپ کې ترلاسه کړئ',
    summary: 'ډاکټر مشوره بشپړوي او نسخه مو د واټس‌اپ له لارې درلېږي.',
    preview: 'د نسخې خبر',
    Icon: FileText,
  },
]

function PhonePreview({ step }: { step: number }) {
  const selected = steps[step]!
  const Icon = selected.Icon

  return (
    <div className={styles.phoneShell} aria-label={`د ${selected.preview} انځوریزه بېلګه`}>
      <div className={styles.phoneSpeaker} aria-hidden="true" />
      <div className={styles.phoneScreen}>
        <div className={styles.phoneStatus}>
          <span>انځوریزه بېلګه</span>
          <span dir="ltr">● ● ●</span>
        </div>
        <div className={styles.phoneHeader}>
          <span className={styles.phoneAvatar}><MessageCircle size={17} aria-hidden="true" /></span>
          <span><strong>ای طبیب</strong><small>د کوژک کلینک خدمت · چمن</small></span>
        </div>
        <div className={styles.phoneBody} key={step}>
          <span className={styles.phoneDate}>د مشورې بهیر</span>
          {step === 0 && (
            <>
              <div className={styles.chatBubble}>سلام، د مشورې لپاره اړیکه نیسم.</div>
              <div className={`${styles.chatBubble} ${styles.chatReply}`}>مهرباني وکړئ د ناروغ نوم ولیکئ.</div>
              <div className={styles.chatBubble}>د ناروغ نوم</div>
            </>
          )}
          {step === 1 && (
            <>
              <div className={styles.chatReply}>مننه. استازی به نور معلومات درسره بشپړ کړي.</div>
              <div className={styles.attachmentCard}><ClipboardList size={20} aria-hidden="true" /><span><strong>پخوانی راپور</strong><small>د ناروغ له خوا رالېږل شوی فایل</small></span></div>
              <div className={styles.attachmentCard}><FileText size={20} aria-hidden="true" /><span><strong>پخوانۍ نسخه</strong><small>د بیاکتنې لپاره</small></span></div>
            </>
          )}
          {step === 2 && (
            <>
              <div className={styles.receiptCard}>
                <span><Icon size={21} aria-hidden="true" /> د مشورې فیس</span>
                <strong>۲۰۰ افغانۍ</strong>
                <small>یا ۷۰۰ پاکستانۍ روپۍ</small>
              </div>
              <div className={`${styles.chatBubble} ${styles.chatReply}`}>د ورکړې لاره له استازي سره تایید کړئ.</div>
              <div className={styles.confirmation}><Check size={17} aria-hidden="true" /> د استازي له خوا تایید</div>
            </>
          )}
          {step === 3 && (
            <>
              <div className={styles.appointmentCard}>
                <CalendarCheck size={25} aria-hidden="true" />
                <strong>د مشورې وخت تایید شو</strong>
                <span>وخت به په واټس‌اپ کې درولېږل شي.</span>
              </div>
              <div className={`${styles.chatBubble} ${styles.chatReply}`}>مهرباني وکړئ په تایید شوي وخت حاضر شئ.</div>
            </>
          )}
          {step === 4 && (
            <>
              <div className={styles.miniCall}>
                <Image
                  src={`${BASE_PATH}/landing/doctor.jpg`}
                  alt="د ډاکټر انځوریزه بېلګه"
                  width={1120}
                  height={1400}
                  sizes="160px"
                  className={styles.miniDoctor}
                />
                <span className={styles.miniPatient}><UserRound size={27} aria-hidden="true" /></span>
                <span className={styles.miniCallLabel}>د eTabeeb مشورې پاڼه</span>
              </div>
              <div className={styles.confirmation}><Video size={16} aria-hidden="true" /> د ټاکلي وخت مشوره</div>
            </>
          )}
          {step === 5 && (
            <>
              <div className={styles.prescriptionCard}>
                <span className={styles.prescriptionMark}><FileText size={22} aria-hidden="true" /></span>
                <span><strong>د مشورې نسخه</strong><small>د ډاکټر له خوا بشپړه شوه</small></span>
                <Check size={18} aria-hidden="true" />
              </div>
              <div className={`${styles.chatBubble} ${styles.chatReply}`}>ستاسو نسخه دلته درولېږل شوه.</div>
              <div className={styles.messageDelivery}><MessageCircle size={16} aria-hidden="true" /> د واټس‌اپ له لارې</div>
            </>
          )}
        </div>
        <div className={styles.phoneFooter} aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  )
}

export function ConsultationJourney() {
  const [activeStep, setActiveStep] = useState(0)
  const current = steps[activeStep]!
  const CurrentIcon = current.Icon

  const goTo = (index: number) => {
    setActiveStep(Math.min(steps.length - 1, Math.max(0, index)))
  }

  return (
    <div className={styles.journey}>
      <div className={styles.journeyTabs} role="group" aria-label="د مشورې شپږ پړاوونه">
        {steps.map(({ title }, index) => (
          <button
            type="button"
            key={title}
            className={`${styles.stepTab} ${index === activeStep ? styles.stepTabActive : ''}`}
            aria-pressed={index === activeStep}
            aria-label={`پړاو ${index + 1}: ${title}`}
            onClick={() => goTo(index)}
          >
            <span>{['۱', '۲', '۳', '۴', '۵', '۶'][index]}</span>
            <small>{title}</small>
          </button>
        ))}
      </div>

      <div className={styles.journeyContent}>
        <div className={styles.stepDescription} aria-live="polite" aria-atomic="true">
          <span className={styles.stepIcon}><CurrentIcon aria-hidden="true" size={25} /></span>
          <span className={styles.stepCount}>پړاو {['۱', '۲', '۳', '۴', '۵', '۶'][activeStep]} له ۶ څخه</span>
          <h3>{current.title}</h3>
          <p>{current.summary}</p>
          <div className={styles.stepControls}>
            <button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0}>
              <ArrowRight aria-hidden="true" size={18} /> مخکینی ګام
            </button>
            <button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === steps.length - 1}>
              بل ګام <ArrowLeft aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <div className={styles.previewColumn}>
          <span className={styles.previewLabel}>په واټس‌اپ کې د خبرو انځوریزه بېلګه</span>
          <PhonePreview step={activeStep} />
          <p className={styles.previewNote}>دا یوازې د بهیر د تشریح لپاره تمثیلي انځورونه دي.</p>
        </div>
      </div>
    </div>
  )
}
