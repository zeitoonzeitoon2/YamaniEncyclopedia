'use client'

import { Link } from '@/lib/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { applyArticleTransforms } from '@/lib/footnotes'
import { useTranslations } from 'next-intl'
import StudentChapterQuiz from '@/components/StudentChapterQuiz'

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
  prerequisites: { prerequisiteCourse: { id: string; title: string } }[]
  enrollment: Enrollment
  progress: string[]
  lastExam?: {
    id: string
    status: string
    scheduledAt: string | null
    meetLink: string | null
    score: number | null
    feedback: string | null
  } | null
}

export default function CourseViewerPage() {
  const t = useTranslations('academy')
  const params = useParams() as { id?: string }
  const courseId = params?.id || ''

  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [prerequisites, setPrerequisites] = useState<CourseViewerResponse['prerequisites']>([])
  const [enrollment, setEnrollment] = useState<Enrollment>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [lastExam, setLastExam] = useState<CourseViewerResponse['lastExam']>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [requestingExam, setRequestingExam] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  const selectedChapter = useMemo(() => chapters.find((c) => c.id === selectedId) || null, [chapters, selectedId])
  const currentIndex = useMemo(() => chapters.findIndex((c) => c.id === selectedId), [chapters, selectedId])
  const previousChapter = useMemo(() => (currentIndex > 0 ? chapters[currentIndex - 1] : null), [chapters, currentIndex])
  const nextChapter = useMemo(
    () => (currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null),
    [chapters, currentIndex]
  )
  const completedCount = progress.filter((id) => chapters.some((c) => c.id === id)).length
  const allCompleted = chapters.length > 0 && completedCount === chapters.length

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
        setPrerequisites(Array.isArray(payload.prerequisites) ? payload.prerequisites : [])
        setEnrollment(payload.enrollment ?? null)
        setProgress(Array.isArray(payload.progress) ? payload.progress : [])
        setLastExam(payload.lastExam || null)
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

  const requestExam = async () => {
    if (!courseId || requestingExam) return
    try {
      setRequestingExam(true)
      const res = await fetch('/api/academy/exams/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; examRequest?: any }
      if (!res.ok) {
        toast.error(payload.error || t('examRequestError'))
        return
      }
      setLastExam(payload.examRequest)
      toast.success(t('examRequestSuccess'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('examRequestError')
      toast.error(msg)
    } finally {
      setRequestingExam(false)
    }
  }

  return (
    <div className="min-h-screen bg-site-bg flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6 relative z-0">
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
              {prerequisites.length > 0 && (
                <div className="card space-y-3">
                  <h3 className="text-lg font-bold text-site-text heading">{t('prerequisites')}</h3>
                  <div className="space-y-2">
                    {prerequisites.map((p) => (
                      <Link
                        key={p.prerequisiteCourse.id}
                        href={`/academy/course/${p.prerequisiteCourse.id}`}
                        className="block p-2 rounded-lg border border-gray-700 bg-site-card/40 hover:border-warm-primary/60"
                      >
                        <div className="text-site-text text-sm">{p.prerequisiteCourse.title}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

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

                {enrollment && allCompleted && (
                  <div className="pt-4 border-t border-site-border space-y-3">
                    <h4 className="text-sm font-bold text-site-text">{t('examSectionTitle')}</h4>
                    {!lastExam ? (
                      <button
                        type="button"
                        onClick={requestExam}
                        disabled={requestingExam}
                        className="btn-primary w-full text-sm"
                      >
                        {requestingExam ? '...' : t('requestExamButton')}
                      </button>
                    ) : (
                      <div className="p-3 rounded-lg bg-warm-primary/10 border border-warm-primary/20 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-site-muted">{t('examStatus')}:</span>
                          <span className="font-bold text-warm-primary">{t(`examStatus_${lastExam.status}` as any)}</span>
                        </div>
                        {lastExam.scheduledAt && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-site-muted">{t('examDate')}:</span>
                            <span className="text-site-text">{new Date(lastExam.scheduledAt).toLocaleString('en-GB')}</span>
                          </div>
                        )}
                        {lastExam.meetLink && (
                          <a
                            href={lastExam.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary w-full text-xs text-center block"
                          >
                            {t('joinExam')}
                          </a>
                        )}
                        {lastExam.status === 'FAILED' && (
                          <button
                            type="button"
                            onClick={requestExam}
                            disabled={requestingExam}
                            className="btn-primary w-full text-sm mt-2"
                          >
                            {requestingExam ? '...' : t('requestExamButton')}
                          </button>
                        )}
                        {lastExam.status === 'PASSED' && lastExam.score !== null && (
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-warm-primary/20">
                            <span className="text-site-muted">{t('examScore')}:</span>
                            <span className="font-bold text-green-500">{lastExam.score}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                {!enrollment && (
                  <div className="p-4 rounded-lg bg-warm-primary/10 border border-warm-primary/20 flex flex-col items-center gap-3">
                    <div className="text-sm text-site-text">{t('enrollHint')}</div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setLoading(true)
                          const res = await fetch('/api/academy/enroll', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ courseId }),
                          })
                          if (res.ok) {
                            toast.success(t('enrollSuccess'))
                            window.location.reload()
                          } else {
                            const data = await res.json()
                            if (data.error === 'PREREQUISITES_NOT_MET' && data.missingPrerequisites) {
                              toast.error(t('prerequisitesNotMet', { courses: data.missingPrerequisites }))
                            } else {
                              toast.error(data.error || t('enrollError'))
                            }
                          }
                        } catch (e) {
                          toast.error(t('enrollError'))
                        } finally {
                          setLoading(false)
                        }
                      }}
                      className="btn-primary"
                    >
                      {t('enrollButton')}
                    </button>
                  </div>
                )}
                <div
                  className="prose prose-invert max-w-none article-content"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />

                {selectedId && <StudentChapterQuiz courseId={courseId} chapterId={selectedId} />}

                <div className="flex items-center justify-between pt-8 border-t border-site-border">
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
