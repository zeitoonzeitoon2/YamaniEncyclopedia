'use client'

import { Link } from '@/lib/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'
import { applyArticleTransforms } from '@/lib/footnotes'
import { useTranslations } from 'next-intl'

type Chapter = {
  id: string
  title: string
  content: string
  orderIndex: number
  version: number | null
  originalChapterId: string | null
}

type CourseInfo = {
  id: string
  title: string
  description: string | null
  status: string
  isActive: boolean
  domain: { id: string; name: string; slug: string }
}

type Enrollment = { status: string } | null

type CourseViewerResponse = {
  course: CourseInfo
  chapters: Chapter[]
  enrollment: Enrollment
  progress: string[]
}

export default function CourseViewerPage() {
  const t = useTranslations('academy')
  const params = useParams() as { id?: string }
  const courseId = params?.id || ''

  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [enrollment, setEnrollment] = useState<Enrollment>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')

  const selectedChapter = useMemo(() => chapters.find((c) => c.id === selectedId) || null, [chapters, selectedId])
  const currentIndex = useMemo(() => chapters.findIndex((c) => c.id === selectedId), [chapters, selectedId])
  const previousChapter = useMemo(() => (currentIndex > 0 ? chapters[currentIndex - 1] : null), [chapters, currentIndex])
  const nextChapter = useMemo(
    () => (currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null),
    [chapters, currentIndex]
  )
  const completedCount = progress.filter((id) => chapters.some((c) => c.id === id)).length

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/academy/course/${courseId}`, { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as Partial<CourseViewerResponse> & { error?: string }
        if (!res.ok) {
          toast.error(payload.error || t('courseLoadError'))
          return
        }
        setCourse(payload.course || null)
        const nextChapters = Array.isArray(payload.chapters) ? payload.chapters : []
        setChapters(nextChapters)
        setEnrollment(payload.enrollment ?? null)
        setProgress(Array.isArray(payload.progress) ? payload.progress : [])
        if (nextChapters.length > 0) {
          setSelectedId((prev) => (prev && nextChapters.some((c) => c.id === prev) ? prev : nextChapters[0].id))
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('courseLoadError')
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId, t])

  useEffect(() => {
    setPreviewHtml(applyArticleTransforms(selectedChapter?.content || ''))
  }, [selectedChapter?.id, selectedChapter?.content])

  const markComplete = async () => {
    if (!courseId || !selectedChapter) return
    try {
      setMarkingId(selectedChapter.id)
      const res = await fetch(`/api/academy/course/${courseId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: selectedChapter.id }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('progressUpdateError'))
        return
      }
      setProgress((prev) => (prev.includes(selectedChapter.id) ? prev : [...prev, selectedChapter.id]))
      toast.success(t('progressUpdateSuccess'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('progressUpdateError')
      toast.error(msg)
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{course?.title || t('courseFallbackTitle')}</h1>
            {course?.description && <p className="text-site-muted mt-2">{course.description}</p>}
            {course && (
              <div className="text-xs text-site-muted mt-2">
                {t('domainLabel')}: {course.domain.name} {enrollment ? `• ${t('statusLabel')}: ${enrollment.status}` : ''}
              </div>
            )}
          </div>
          <Link href="/academy" className="btn-secondary">
            {t('backToAcademy')}
          </Link>
        </div>

        {loading ? (
          <div className="text-site-muted">{t('loading')}</div>
        ) : chapters.length === 0 ? (
          <div className="text-site-muted">{t('noChapters')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <div className="space-y-4 lg:order-2">
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-site-text heading">{t('courseContent')}</h3>
                  {enrollment && (
                    <span className="text-xs text-site-muted">
                      {completedCount}/{chapters.length}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {chapters.map((chapter, index) => {
                    const completed = progress.includes(chapter.id)
                    const active = chapter.id === selectedId
                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => setSelectedId(chapter.id)}
                        className={`w-full text-right p-2 rounded-lg border ${
                          active ? 'border-warm-primary bg-warm-primary/10' : 'border-gray-700 bg-site-card/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-site-text text-sm truncate">{chapter.title}</div>
                            <div className="text-xs text-site-muted mt-1">
                              {t('chapterLabel')} #{index + 1} {chapter.version ? `• v${chapter.version}` : ''}
                            </div>
                          </div>
                          {completed && <span className="text-xs text-warm-primary">{t('completed')}</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:order-1">
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-site-text heading">{selectedChapter?.title}</h2>
                  {enrollment && selectedChapter && (
                    <button
                      type="button"
                      onClick={markComplete}
                      disabled={markingId === selectedChapter.id || progress.includes(selectedChapter.id)}
                      className="btn-primary disabled:opacity-50"
                    >
                      {progress.includes(selectedChapter.id)
                        ? t('completedButton')
                        : markingId
                          ? '...'
                          : t('markComplete')}
                    </button>
                  )}
                </div>
                {!enrollment && <div className="text-xs text-site-muted">{t('enrollHint')}</div>}
                <div className="prose prose-invert max-w-none text-site-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => previousChapter && setSelectedId(previousChapter.id)}
                    disabled={!previousChapter}
                    className="btn-secondary disabled:opacity-50"
                  >
                    {t('previous')}
                  </button>
                  <button
                    type="button"
                    onClick={() => nextChapter && setSelectedId(nextChapter.id)}
                    disabled={!nextChapter}
                    className="btn-secondary disabled:opacity-50"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
