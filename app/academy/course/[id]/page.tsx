'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'
import { applyArticleTransforms } from '@/lib/footnotes'

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
  const completedCount = progress.filter((id) => chapters.some((c) => c.id === id)).length

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/academy/course/${courseId}`, { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as Partial<CourseViewerResponse> & { error?: string }
        if (!res.ok) {
          toast.error(payload.error || 'تعذر تحميل الدورة')
          return
        }
        setCourse(payload.course || null)
        const nextChapters = Array.isArray(payload.chapters) ? payload.chapters : []
        setChapters(nextChapters)
        setEnrollment(payload.enrollment ?? null)
        setProgress(Array.isArray(payload.progress) ? payload.progress : [])
        if (!selectedId && nextChapters.length > 0) {
          setSelectedId(nextChapters[0].id)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'تعذر تحميل الدورة'
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId])

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
        toast.error(payload.error || 'تعذر تحديث التقدم')
        return
      }
      setProgress((prev) => (prev.includes(selectedChapter.id) ? prev : [...prev, selectedChapter.id]))
      toast.success('تم تحديث التقدم')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر تحديث التقدم'
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
            <h1 className="text-3xl font-bold text-site-text heading">{course?.title || 'الدورة'}</h1>
            {course?.description && <p className="text-site-muted mt-2">{course.description}</p>}
            {course && (
              <div className="text-xs text-site-muted mt-2">
                المجال: {course.domain.name} {enrollment ? `• حالتك: ${enrollment.status}` : ''}
              </div>
            )}
          </div>
          <Link href="/academy" className="btn-secondary">
            العودة للأكاديمية
          </Link>
        </div>

        {loading ? (
          <div className="text-site-muted">جارٍ التحميل...</div>
        ) : chapters.length === 0 ? (
          <div className="text-site-muted">لا توجد فصول معتمدة بعد.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-4">
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-site-text heading">المحتوى</h3>
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
                              الفصل #{index + 1} {chapter.version ? `• v${chapter.version}` : ''}
                            </div>
                          </div>
                          {completed && <span className="text-xs text-warm-primary">مكتمل</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
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
                      {progress.includes(selectedChapter.id) ? 'تم الإكمال' : markingId ? '...' : 'وضع علامة كمكتمل'}
                    </button>
                  )}
                </div>
                {!enrollment && (
                  <div className="text-xs text-site-muted">سجّل في الدورة لتتبع التقدم.</div>
                )}
                <div className="prose prose-invert max-w-none text-site-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
