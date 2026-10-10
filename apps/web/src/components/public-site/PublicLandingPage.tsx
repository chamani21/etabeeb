import Image from 'next/image'
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  BadgeCheck,
  Brain,
  ClipboardList,
  Droplets,
  HeartPulse,
  MapPin,
  MessageCircle,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PublicNavigation } from './PublicNavigation'
import { ConsultationJourney } from './ConsultationJourney'
import styles from './public-site.module.css'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const WHATSAPP_URL = 'https://wa.me/923100006526'

const consultationTopics: { label: string; Icon: LucideIcon }[] = [
  { label: 'شکر او لوړ فشار', Icon: HeartPulse },
  { label: 'د مزمنو ناروغیو تعقیب', Icon: Activity },
  { label: 'د معدې او ځیګر ستونزې', Icon: Droplets },
  { label: 'تنفسي ستونزې', Icon: Wind },
  { label: 'اندېښنه او خپګان', Icon: Brain },
  { label: 'دوهم طبي نظر', Icon: ClipboardList },
]

const faqs = [
  {
    question: 'څنګه مشوره پیل کړم؟',
    answer:
      'په واټس‌اپ پیغام واستوئ او د ناروغ نوم ولیکئ. زموږ استازی به پاتې معلومات درسره بشپړ کړي.',
  },
  {
    question: 'ایا جلا اپلېکېشن ته اړتیا ده؟',
    answer:
      'د اړیکې او پیغامونو لپاره واټس‌اپ کارېږي. د ویډیو مشورې لینک د موبایل په وېب‌براوزر کې د eTabeeb د مشورې پاڼه پرانیزي.',
  },
  {
    question: 'پخواني راپورونه او نسخې څنګه شریک کړم؟',
    answer:
      'د راپورونو او پخوانیو نسخو روښانه عکسونه یا فایلونه په واټس‌اپ کې استازي ته ولېږئ؛ هغه به یې ډاکټر ته ورسوي.',
  },
  {
    question: 'فیس او د پیسو ورکړه څنګه تنظیمېږي؟',
    answer:
      'فیس ۲۰۰ افغانۍ یا ۷۰۰ پاکستانۍ روپۍ دی. د ورکړې لاره له استازي سره تایید کړئ؛ تر تایید مخکې پیسې مه لېږئ.',
  },
  {
    question: 'د مشورې وخت به کله معلومېږي؟',
    answer:
      'استازی معلومات بشپړوي، ډاکټر وخت تاییدوي او بیا به خبر درکړل شي. مشوره په تایید شوي وخت کې پیلېږي.',
  },
  {
    question: 'که انټرنېټ کمزوری وي څه وکړم؟',
    answer:
      'استازي ته مخکې ووایئ څو د اړیکې مناسب ډول درسره وڅېړي. د ویډیو یا غږ کیفیت د شبکې له حالت سره تړاو لري.',
  },
]

function WhatsAppLink({
  children,
  className,
  label,
}: {
  children: React.ReactNode
  className: string | undefined
  label?: string
}) {
  return (
    <a
      className={className}
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      {children}
    </a>
  )
}

export function PublicLandingPage() {
  return (
    <div className={styles.site} dir="rtl">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#home" aria-label="ای طبیب، سرپاڼه">
            <Image
              src={`${BASE_PATH}/landing/etabeeb-logo.jpg`}
              alt="د ای طبیب رسمي لوگو"
              width={640}
              height={640}
              priority
              sizes="56px"
              className={styles.brandLogo}
            />
            <span className={styles.brandText}>
              <strong>ای طبیب</strong>
              <span>د کوژک کلینک خدمت · چمن</span>
            </span>
          </a>

          <nav className={styles.desktopNav} aria-label="اصلي برخې">
            <a href="#how-it-works">څنګه کار کوي؟</a>
            <a href="#doctor">ستاسو ډاکټر</a>
            <a href="#purpose">زموږ موخه</a>
            <a href="#faq">عامې پوښتنې</a>
          </nav>

          <div className={styles.headerActions}>
            <WhatsAppLink className={styles.headerCta} label="په واټس‌اپ اړیکه نیول">
              <MessageCircle aria-hidden="true" size={19} />
              <span>په واټس‌اپ اړیکه</span>
            </WhatsAppLink>
            <PublicNavigation />
          </div>
        </div>
      </header>

      <main className={styles.main} id="home">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} aria-hidden="true" />
              له چمنه، زموږ د خلکو لپاره
            </span>
            <h1 id="hero-title">ستاسو ډاکټر، ستاسو په ژبه، ستاسو له خپل ځایه.</h1>
            <p className={styles.heroDescription}>
              که کلینک ته راتګ درته ستونزمن وي، ای طبیب د واټس‌اپ له لارې له ډاکټر جلال الدین سره د پښتو طبي مشورې اړیکه برابروي.
            </p>
            <div className={styles.heroActions}>
              <WhatsAppLink className={styles.primaryButton}>
                <MessageCircle aria-hidden="true" size={20} />
                مشوره پیل کړئ
              </WhatsAppLink>
              <a className={styles.secondaryButton} href="#how-it-works">
                <ArrowDown aria-hidden="true" size={18} />
                کړنلاره وګورئ
              </a>
            </div>
            <p className={styles.heroHint}>
              <BadgeCheck aria-hidden="true" size={17} />
              په واټس‌اپ کې نوم ولیکئ؛ استازی به پاتې ګامونه درسره بشپړ کړي.
            </p>
            <div className={styles.heroLocation}>
              <MapPin aria-hidden="true" size={18} />
              <span>د کوژک اسپیشلسټ کلینک، چمن</span>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.videoCard}>
              <Image
                src={`${BASE_PATH}/landing/doctor.jpg`}
                alt="ډاکټر جلال الدین په سپین کلینیکي چپنه کې"
                width={1120}
                height={1400}
                priority
                sizes="(max-width: 700px) 92vw, (max-width: 1100px) 48vw, 500px"
                className={styles.heroPortrait}
              />
              <div className={styles.videoTopline}>
                <span className={styles.mockupTag}>انځوریزه بېلګه</span>
                <span className={styles.callPlatform}>د eTabeeb مشورې پاڼه</span>
              </div>
              <div className={styles.doctorCaption}>
                <span className={styles.captionDot} aria-hidden="true" />
                <span>
                  <strong>ډاکټر جلال الدین</strong>
                  <small>د کوژک اسپیشلسټ کلینک · چمن</small>
                </span>
              </div>
              <div className={styles.patientTile} aria-label="د ناروغ تمثیلي انځور">
                <span className={styles.patientAvatar} aria-hidden="true">
                  <UserRound size={25} />
                </span>
                <span>تمثیلي ناروغ</span>
              </div>
              <div className={styles.mockupControls} aria-hidden="true">
                <span><span className={styles.controlMic}>●</span></span>
                <span className={styles.endCall}>×</span>
                <span><span className={styles.controlVideo}>▣</span></span>
              </div>
            </div>
            <p className={styles.visualCaption}>
              واټس‌اپ پیغام او د مشورې لینک رسوي؛ ویډیويي اړیکه د eTabeeb په پاڼه کې کېږي.
            </p>
          </div>
        </section>

        <section className={styles.trustStrip} aria-label="د خدمت لنډ معلومات">
          <div><MessageCircle aria-hidden="true" /><span>یوه واټس‌اپ شمېره</span></div>
          <div><BadgeCheck aria-hidden="true" /><span>په خپله پښتو ژبه</span></div>
          <div><Stethoscope aria-hidden="true" /><span>له چمنه د کلینک خدمت</span></div>
        </section>

        <section className={styles.section} id="how-it-works" aria-labelledby="journey-title">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>له لومړي پیغامه تر نسخې پورې</span>
            <h2 id="journey-title">ستاسو مشوره څنګه ترسره کېږي؟</h2>
            <p>هر ګام روښانه دی؛ د وخت او ورکړې په اړه له استازي سره خبرې وکړئ.</p>
          </div>
          <ConsultationJourney />
        </section>

        <section className={`${styles.section} ${styles.doctorSection}`} id="doctor" aria-labelledby="doctor-title">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>ستاسو ډاکټر</span>
            <h2 id="doctor-title">له ډاکټر جلال الدین سره خبرې وکړئ</h2>
          </div>
          <div className={styles.doctorCard}>
            <div className={styles.doctorImageWrap}>
              <Image
                src={`${BASE_PATH}/landing/doctor.jpg`}
                alt="ډاکټر جلال الدین"
                width={1120}
                height={1400}
                sizes="(max-width: 700px) 78vw, 320px"
                className={styles.doctorPortrait}
              />
            </div>
            <div className={styles.doctorDetails}>
              <span className={styles.clinicLabel}>د کوژک اسپیشلسټ کلینک، چمن</span>
              <h3>ډاکټر جلال الدین</h3>
              <p className={styles.credentials}>
                <span>ایم بي بي اېس</span>
                <span>آر اېم پي</span>
                <span>ایم ډي، داخله طب</span>
                <span>په آغا خان پوهنتون کې د کورني طب روزنه</span>
              </p>
              <p className={styles.doctorBio}>
                د خپلې روغتیا په اړه په پښتو خبرې وکړئ؛ خپلې نښې، پخواني راپورونه او نسخې له استازي سره شریکولی شئ.
              </p>
              <h4>د مشورې موضوعات</h4>
              <ul className={styles.topicList}>
                {consultationTopics.map(({ label, Icon }) => (
                  <li key={label}><Icon aria-hidden="true" size={17} />{label}</li>
                ))}
              </ul>
              <WhatsAppLink className={styles.primaryButton}>
                <MessageCircle aria-hidden="true" size={19} />
                له ډاکټر سره د مشورې په اړه پوښتنه وکړئ
              </WhatsAppLink>
            </div>
          </div>
        </section>

        <section className={styles.missionSection} id="purpose" aria-labelledby="purpose-title">
          <div className={styles.missionIcon}><HeartPulse aria-hidden="true" size={30} /></div>
          <div>
            <span className={styles.missionEyebrow}>زموږ موخه</span>
            <h2 id="purpose-title">زموږ د خلکو لپاره روغتیا ته د رسېدو اسانه لار</h2>
            <p>
              ای طبیب د کوژک اسپیشلسټ کلینک، چمن یو خدمت دی. د افغانستان کورنیو، د لیرې کلیو اوسېدونکو او هغو خلکو ته د طبي مشورې زمینه برابروي چې سفر او لګښت ورته ستونزمن وي. که د پولې هغې غاړې ته یاست او چمن ته نه شئ راتلای، له خپل ځایه اړیکه نیولی شئ.
            </p>
            <span className={styles.missionSignature}>د کوژک اسپیشلسټ کلینک · چمن</span>
          </div>
        </section>

        <section className={styles.feeSection} aria-labelledby="fee-title">
          <div className={styles.feeCard}>
            <div className={styles.feeIcon}><BadgeCheck aria-hidden="true" size={25} /></div>
            <span className={styles.eyebrow}>د یوې مشورې فیس</span>
            <h2 id="fee-title">۲۰۰ افغانۍ</h2>
            <p className={styles.feeAlternate}>یا ۷۰۰ پاکستانۍ روپۍ</p>
            <p className={styles.feeNote}>د پیسو د ورکړې لاره او د مشورې وخت له استازي سره تایید کړئ.</p>
            <WhatsAppLink className={styles.secondaryCta}>
              <MessageCircle aria-hidden="true" size={18} />
              د فیس په اړه پوښتنه وکړئ
            </WhatsAppLink>
          </div>
        </section>

        <section className={styles.section} id="faq" aria-labelledby="faq-title">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>لارښوونه</span>
            <h2 id="faq-title">عامې پوښتنې</h2>
          </div>
          <div className={styles.faqList}>
            {faqs.map(({ question, answer }) => (
              <details className={styles.faqItem} key={question}>
                <summary>
                  <span>{question}</span>
                  <span className={styles.faqChevron} aria-hidden="true"><ArrowLeft size={18} /></span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.emergency} aria-labelledby="emergency-title">
          <span className={styles.emergencyIcon}><ShieldAlert aria-hidden="true" size={24} /></span>
          <div>
            <h2 id="emergency-title">بیړنی حالت؟</h2>
            <p>
              ای طبیب د بیړنۍ مرستې بدیل نه دی. په بیړني حالت کې نږدې روغتون ته ورشئ. ځینې ستونزې حضوري معاینې ته اړتیا لري.
            </p>
          </div>
        </section>

        <section className={styles.lastCta} aria-labelledby="start-title">
          <span className={styles.lastCtaIcon}><MessageCircle aria-hidden="true" size={24} /></span>
          <h2 id="start-title">له یوه ساده پیغامه یې پیل کړئ</h2>
          <p>خپل نوم په واټس‌اپ کې ولیکئ؛ زموږ استازی به پاتې ګامونه درسره بشپړ کړي.</p>
          <WhatsAppLink className={styles.primaryButton}>
            <MessageCircle aria-hidden="true" size={19} />
            په واټس‌اپ مشوره پیل کړئ
          </WhatsAppLink>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Image
              src={`${BASE_PATH}/landing/etabeeb-logo.jpg`}
              alt="د ای طبیب رسمي لوگو"
              width={640}
              height={640}
              sizes="64px"
              className={styles.footerLogo}
            />
            <div>
              <strong>ای طبیب</strong>
              <span>د کوژک اسپیشلسټ کلینک، چمن یو خدمت</span>
            </div>
          </div>
          <div className={styles.footerContact}>
            <h2>له ای طبیب سره اړیکه</h2>
            <p><MapPin aria-hidden="true" size={18} /> کالج روډ، د ډګري کالج مخې ته، چمن</p>
            <WhatsAppLink className={styles.footerPhone} label="په واټس‌اپ اړیکه، +92 310 0006526">
              <MessageCircle aria-hidden="true" size={18} />
              <bdi dir="ltr">+92 310 0006526</bdi>
            </WhatsAppLink>
          </div>
          <nav className={styles.footerLinks} aria-label="د پاڼې برخې">
            <a href="#how-it-works">کړنلاره</a>
            <a href="#doctor">ډاکټر</a>
            <a href="#purpose">زموږ موخه</a>
            <a href="#faq">عامې پوښتنې</a>
          </nav>
        </div>
        <p className={styles.copyright}>© ای طبیب · د کوژک اسپیشلسټ کلینک، چمن</p>
      </footer>

      <WhatsAppLink className={styles.mobileContact} label="په واټس‌اپ مشوره پیل کړئ">
        <MessageCircle aria-hidden="true" size={21} />
        په واټس‌اپ مشوره پیل کړئ
      </WhatsAppLink>
    </div>
  )
}
