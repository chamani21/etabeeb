import type { Metadata } from 'next'
import { unstable_setRequestLocale } from 'next-intl/server'
import { PublicLandingPage } from '../../components/public-site/PublicLandingPage'

interface HomePageProps {
  params: { locale: string }
}

export const metadata: Metadata = {
  title: 'ای طبیب | له خپل ځایه په پښتو طبي مشوره',
  description:
    'ای طبیب د کوژک اسپیشلسټ کلینک، چمن یو خدمت دی. له ډاکټر جلال الدین سره په پښتو د انلاین طبي مشورې لپاره په واټس‌اپ اړیکه ونیسئ.',
}

export default function HomePage({ params: { locale } }: HomePageProps) {
  unstable_setRequestLocale(locale)
  return <PublicLandingPage />
}
