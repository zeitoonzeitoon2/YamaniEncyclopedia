'use client'

import { Link } from '@/lib/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { Award, BookOpen, User, Calendar, FileText, MessageCircle } from 'lucide-react'
import { AcademyChat } from '@/components/AcademyChat'

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

type TranscriptItem = {
  courseId: string
  status: string
  score: number | null
  updatedAt: string
  course: {
    id: string
    title: string
    domain: { name: string }
  }
  examiner: { name: string | null } | null
}

export default function AcademyDashboardPage() {
  const t = useTranslations('academy')
  const [domains, setDomains] = useState<AcademyDomain[]>([])
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'courses' | 'transcript' | 'communication'>('courses')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [coursesRes, transcriptRes] = await Promise.all([
          fetch('/api/academy/courses?mine=true', { cache: 'no-store' }),
          fetch('/api/academy/transcript', { cache: 'no-store' })
        ])

        const coursesPayload = (await coursesRes.json().catch(() => ({}))) as { domains?: AcademyDomain[]; error?: string }
        const transcriptPayload = (await transcriptRes.json().catch(() => ({}))) as { transcript?: TranscriptItem[]; error?: string }

        if (!coursesRes.ok) toast.error(coursesPayload.error || t('loadError'))
        if (!transcriptRes.ok) toast.error(transcriptPayload.error || t('loadError'))

        setDomains(Array.isArray(coursesPayload.domains) ? coursesPayload.domains : [])
        setTranscript(Array.isArray(transcriptPayload.transcript) ? transcriptPayload.transcript : [])
      } catch (e: unknown) {
        toast.error(t('loadError'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  return (
    <div className="min-h-screen bg-site-bg flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6 relative z-0">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{t('dashboard')}</h1>
            <p className="text-site-muted mt-2">{t('dashboardSubtitle')}</p>
          </div>
          <Link href="/academy" className="btn-secondary self-start">
            {t('backToAcademy')}
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-site-border pb-px">
          <button
            onClick={() => setTab('courses')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'courses'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={16} />
              {t('myCourses')}
            </div>
          </button>
          <button
            onClick={() => setTab('transcript')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'transcript'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              {t('transcript')}
            </div>
          </button>
          <button
            onClick={() => setTab('communication')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'communication'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={16} />
              {t('communication')}
            </div>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-site-muted">{t('loading')}</div>
        ) : tab === 'courses' ? (
          <div className="card">
            <h2 className="text-xl font-bold text-site-text heading mb-3">{t('myCourses')}</h2>
            {domains.length === 0 ? (
              <div className="text-site-muted py-4">{t('empty')}</div>
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
                          className="block p-3 rounded-lg border border-gray-700 bg-site-card/40 hover:border-warm-primary/60 transition-colors"
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
        ) : tab === 'transcript' ? (
          <div className="card">
            <h2 className="text-xl font-bold text-site-text heading mb-3">{t('passedCourses')}</h2>
            {transcript.length === 0 ? (
              <div className="text-site-muted py-4">{t('noPassedCourses')}</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {transcript.map((item) => (
                  <div key={item.courseId} className="p-4 rounded-lg border border-gray-700 bg-site-card/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Award className="text-green-500" size={20} />
                        <h3 className="text-lg font-bold text-site-text">{item.course.title}</h3>
                      </div>
                      <div className="text-sm text-site-muted">{item.course.domain.name}</div>
                      <div className="flex flex-wrap gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-xs text-site-muted">
                          <User size={14} />
                          {t('examiner')}: <span className="text-site-text">{item.examiner?.name || '---'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-site-muted">
                          <Calendar size={14} />
                          {t('passDate')}: <span className="text-site-text">{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    {item.score !== null && (
                      <div className="flex items-center justify-center w-16 h-16 rounded-full border-4 border-green-500/30 text-green-500 font-bold text-xl">
                        {item.score}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <AcademyChat />
        )}
      </main>
    </div>
  )
}
