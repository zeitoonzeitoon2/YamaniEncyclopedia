'use client'

import { Link } from '@/lib/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'
import { useTranslations } from 'next-intl'

type AcademyCourse = {
  id: string
  title: string
  description: string | null
}

type AcademyDomain = {
  id: string
  name: string
  slug: string
  description: string | null
  courses: AcademyCourse[]
}

export default function AcademyDashboardPage() {
  const t = useTranslations('academy')
  const [domains, setDomains] = useState<AcademyDomain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/academy/courses', { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as { domains?: AcademyDomain[]; error?: string }
        if (!res.ok) {
          toast.error(payload.error || t('loadError'))
          return
        }
        setDomains(Array.isArray(payload.domains) ? payload.domains : [])
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('loadError')
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{t('dashboard')}</h1>
            <p className="text-site-muted mt-2">{t('dashboardSubtitle')}</p>
          </div>
          <Link href="/academy" className="btn-secondary">
            {t('backToAcademy')}
          </Link>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-site-text heading mb-3">{t('myCourses')}</h2>
          {loading ? (
            <div className="text-site-muted">{t('loading')}</div>
          ) : domains.length === 0 ? (
            <div className="text-site-muted">{t('empty')}</div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => (
                <div key={domain.id} className="space-y-2">
                  <div className="text-sm text-site-muted">{domain.name}</div>
                  <div className="space-y-2">
                    {domain.courses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/academy/course/${course.id}`}
                        className="block p-3 rounded-lg border border-gray-700 bg-site-card/40 hover:border-warm-primary/60"
                      >
                        <div className="text-site-text font-medium">{course.title}</div>
                        {course.description && <div className="text-xs text-site-muted mt-1">{course.description}</div>}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
