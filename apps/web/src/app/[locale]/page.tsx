import { getTranslations } from 'next-intl/server'

// Home page — will be progressively enhanced with Stitch screen 688d1f67...
export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('home')

  return (
    <main className="min-h-screen bg-surface">
      {/* TODO: Implement full home screen from Stitch screen 688d1f6761364919944610a1c8d2c2b1 */}
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="font-naskh text-urdu-headline font-bold text-primary">
            {t('title')}
          </h1>
          <p className="mt-4 font-naskh text-urdu-body text-ink-muted">
            {t('subtitle')}
          </p>
        </div>
      </div>
    </main>
  )
}
