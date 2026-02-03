import { Link } from '@/lib/navigation'
import { Header } from '@/components/Header'
import { useTranslations } from 'next-intl'

export default function AcademyTeachingPage() {
  const t = useTranslations('academy')

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{t('examinerDashboard')}</h1>
            <p className="text-site-muted mt-2">{t('examinerSubtitle')}</p>
          </div>
          <Link href="/academy" className="btn-secondary">
            {t('backToAcademy')}
          </Link>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-site-text heading mb-3">{t('upcomingSessions')}</h2>
          <div className="text-site-muted">{t('noSessions')}</div>
        </div>
      </main>
    </div>
  )
}
