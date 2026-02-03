'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Header } from '@/components/Header'
import CommentSection from '@/components/CommentSection'
import QuickArticleModal from '@/components/QuickArticleModal'
import toast from 'react-hot-toast'
import { applyArticleTransforms } from '@/lib/footnotes'

type ChapterVote = {
  voterId: string
  vote: string
}

type ChapterAuthor = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type CourseChapter = {
  id: string
  title: string
  content: string
  orderIndex: number
  status: string
  version: number | null
  originalChapterId: string | null
  createdAt: string
  updatedAt: string
  author: ChapterAuthor
  votes: ChapterVote[]
}

type CourseInfo = {
  id: string
  title: string
  description: string | null
  domainId: string
}

type ChaptersResponse = { course: CourseInfo; chapters: CourseChapter[] }

type EditorMode = 'new' | 'edit' | 'revision'

export default function AdminCourseChaptersPage() {
  const params = useParams() as { courseId?: string }
  const courseId = params?.courseId || ''
  const router = useRouter()
  const { data: session, status } = useSession()

  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [chapters, setChapters] = useState<CourseChapter[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('new')
  const [form, setForm] = useState({ title: '', content: '', orderIndex: 0, originalChapterId: '' })
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [orderDirty, setOrderDirty] = useState(false)
  const [votingKey, setVotingKey] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const autoDraftingRef = useRef(false)

  const selectedChapter = useMemo(() => chapters.find((c) => c.id === selectedId) || null, [chapters, selectedId])

  const resetFormForNew = (nextOrderIndex: number) => {
    setMode('new')
    setSelectedId(null)
    setForm({ title: '', content: '', orderIndex: nextOrderIndex, originalChapterId: '' })
    setActiveDraftId(null)
    autoDraftingRef.current = false
  }

  const fetchChapters = async () => {
    if (!courseId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as Partial<ChaptersResponse> & { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'خطأ في جلب الفصول')
        return
      }
      setCourse(data.course || null)
      setChapters(Array.isArray(data.chapters) ? data.chapters : [])
      if (!selectedId && Array.isArray(data.chapters) && data.chapters.length > 0) {
        setSelectedId(data.chapters[0].id)
        setMode('edit')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في جلب الفصول'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    fetchChapters()
  }, [session, status, courseId, router])

  useEffect(() => {
    if (!selectedChapter) return
    setActiveDraftId(selectedChapter.status === 'PENDING' ? selectedChapter.id : null)
    autoDraftingRef.current = false
    setForm({
      title: selectedChapter.title || '',
      content: selectedChapter.content || '',
      orderIndex: selectedChapter.orderIndex ?? 0,
      originalChapterId: selectedChapter.originalChapterId || '',
    })
    setMode('edit')
  }, [selectedChapter?.id])

  useEffect(() => {
    setPreviewHtml(applyArticleTransforms(form.content || ''))
  }, [form.content])

  const handleEditorDraftChange = async (draft: { title: string; description?: string; content: string }) => {
    setForm((prev) => ({ ...prev, title: draft.title, content: draft.content }))
    if (!selectedChapter) return
    if (selectedChapter.status !== 'APPROVED') return
    if (activeDraftId) return
    if (!draft.content.trim()) return
    if (!courseId) return
    const userId = session?.user?.id || ''
    if (!userId) return

    const rootId = selectedChapter.originalChapterId || selectedChapter.id
    const existingDraft = chapters.find(
      (chapter) =>
        chapter.status === 'PENDING' && chapter.originalChapterId === rootId && chapter.author.id === userId
    )
    if (existingDraft) {
      setActiveDraftId(existingDraft.id)
      setMode('edit')
      return
    }

    if (autoDraftingRef.current) return
    const draftTitle = (draft.title || selectedChapter.title || '').trim()
    if (!draftTitle) return
    autoDraftingRef.current = true
    try {
      const content = draft.content
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          content,
          orderIndex: selectedChapter.orderIndex ?? 0,
          originalChapterId: rootId,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; chapter?: { id?: string } }
      if (!res.ok) {
        toast.error(payload.error || 'تعذر إنشاء المسودة')
        return
      }
      if (payload.chapter?.id) {
        setActiveDraftId(payload.chapter.id)
      }
      setMode('edit')
      await fetchChapters()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر إنشاء المسودة'
      toast.error(msg)
    } finally {
      autoDraftingRef.current = false
    }
  }

  const handleSave = async () => {
    if (!courseId) return
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      toast.error('العنوان والمحتوى مطلوبان')
      return
    }
    try {
      setSaving(true)
      const targetId = activeDraftId || (mode === 'edit' ? selectedId : null)
      if (targetId) {
        const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/${targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, orderIndex: form.orderIndex }),
        })
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(payload.error || 'تعذر حفظ الفصل')
          return
        }
      } else {
        const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content,
            orderIndex: form.orderIndex,
            ...(form.originalChapterId ? { originalChapterId: form.originalChapterId } : {}),
          }),
        })
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(payload.error || 'تعذر إنشاء المسودة')
          return
        }
      }
      await fetchChapters()
      toast.success('تم حفظ الفصل')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر حفظ الفصل'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (chapterId: string) => {
    if (!courseId) return
    try {
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/${chapterId}`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'تعذر حذف الفصل')
        return
      }
      setSelectedId(null)
      resetFormForNew(Math.max(chapters.length - 1, 0))
      await fetchChapters()
      toast.success('تم حذف الفصل')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر حذف الفصل'
      toast.error(msg)
    }
  }

  const handleVote = async (chapterId: string, vote: 'APPROVE' | 'REJECT') => {
    if (!courseId) return
    try {
      setVotingKey(`${chapterId}:${vote}`)
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, vote }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'تعذر تسجيل التصويت')
        return
      }
      await fetchChapters()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر تسجيل التصويت'
      toast.error(msg)
    } finally {
      setVotingKey(null)
    }
  }

  const moveChapter = (chapterId: string, direction: 'up' | 'down') => {
    setChapters((prev) => {
      const list = [...prev]
      const idx = list.findIndex((c) => c.id === chapterId)
      if (idx === -1) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= list.length) return prev
      const temp = list[idx]
      list[idx] = list[target]
      list[target] = temp
      const reordered = list.map((c, index) => ({ ...c, orderIndex: index }))
      setOrderDirty(true)
      return reordered
    })
  }

  const saveOrder = async () => {
    if (!courseId) return
    try {
      setReordering(true)
      const order = chapters.map((c, index) => ({ id: c.id, orderIndex: index }))
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'تعذر حفظ الترتيب')
        return
      }
      setOrderDirty(false)
      await fetchChapters()
      toast.success('تم حفظ الترتيب')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر حفظ الترتيب'
      toast.error(msg)
    } finally {
      setReordering(false)
    }
  }



  const chapterLabel = (chapter: CourseChapter) => {
    if (chapter.status === 'APPROVED') return 'معتمد'
    if (chapter.status === 'REJECTED') return 'مرفوض'
    return 'مسودة'
  }

  const pendingChapters = chapters.filter((c) => c.status === 'PENDING')

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">إدارة الفصول</h1>
            {course && (
              <p className="text-site-muted mt-2">{course.title}</p>
            )}
          </div>
          <button type="button" onClick={() => router.push('/dashboard/admin')} className="btn-secondary">
            العودة للوحة الإدارة
          </button>
        </div>

        {loading ? (
          <div className="text-site-muted">جارٍ التحميل...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-site-text heading">الفصول</h3>
                  <button
                    type="button"
                    onClick={() => resetFormForNew(chapters.length)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                  >
                    فصل جديد
                  </button>
                </div>
                {chapters.length === 0 ? (
                  <div className="text-site-muted text-sm">لا توجد فصول بعد.</div>
                ) : (
                  <div className="space-y-2">
                    {chapters.map((chapter, index) => (
                      <div key={chapter.id} className="p-2 rounded-lg border border-gray-700 bg-site-card/40">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(chapter.id)
                            setMode('edit')
                          }}
                          className="w-full text-right"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-site-text text-sm truncate">{chapter.title}</div>
                              <div className="text-xs text-site-muted mt-1">#{index + 1} • {chapterLabel(chapter)}</div>
                            </div>
                            <div className="text-xs text-site-muted">{chapter.version ? `v${chapter.version}` : '—'}</div>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => moveChapter(chapter.id, 'up')}
                            className="px-2 py-1 text-xs rounded border border-gray-700 text-site-muted hover:text-site-text"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveChapter(chapter.id, 'down')}
                            className="px-2 py-1 text-xs rounded border border-gray-700 text-site-muted hover:text-site-text"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(chapter.id)}
                            className="px-2 py-1 text-xs rounded border border-red-600/60 text-red-400 hover:text-red-200"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={saveOrder}
                    disabled={!orderDirty || reordering}
                    className="btn-primary disabled:opacity-50"
                  >
                    {reordering ? '...' : 'حفظ الترتيب'}
                  </button>
                </div>
              </div>

              {pendingChapters.length > 0 && (
                <div className="card space-y-2">
                  <h3 className="text-lg font-bold text-site-text heading">التصويتات المطلوبة</h3>
                  {pendingChapters.map((chapter) => (
                    <div key={chapter.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                      <div className="text-site-text text-sm">{chapter.title}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleVote(chapter.id, 'APPROVE')}
                          disabled={!!votingKey}
                          className={`text-xs px-3 py-2 rounded-lg border ${
                            chapter.votes.some((v) => v.voterId === session?.user?.id && v.vote === 'APPROVE')
                              ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                              : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                          } disabled:opacity-50`}
                        >
                          {votingKey === `${chapter.id}:APPROVE` ? '...' : 'موافقة'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVote(chapter.id, 'REJECT')}
                          disabled={!!votingKey}
                          className={`text-xs px-3 py-2 rounded-lg border ${
                            chapter.votes.some((v) => v.voterId === session?.user?.id && v.vote === 'REJECT')
                              ? 'border-red-600/60 bg-red-600/20 text-site-text'
                              : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                          } disabled:opacity-50`}
                        >
                          {votingKey === `${chapter.id}:REJECT` ? '...' : 'رفض'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="card space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-site-text heading">
                    {mode === 'new' ? 'مسودة فصل جديد' : mode === 'revision' ? 'نسخة جديدة للفصل' : 'تحرير الفصل'}
                  </h3>
                  {selectedChapter && (
                    <div className="text-xs text-site-muted">
                      {chapterLabel(selectedChapter)} • {selectedChapter.author.name || selectedChapter.author.email || '—'}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="عنوان الفصل"
                    className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-site-muted">ترتيب الفصل:</span>
                    <input
                      type="number"
                      value={form.orderIndex}
                      onChange={(e) => setForm((prev) => ({ ...prev, orderIndex: Number(e.target.value) }))}
                      className="w-24 p-2 rounded border border-gray-600 bg-site-bg text-site-text"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-site-text">محتوى الفصل</div>
                      <button
                        type="button"
                        onClick={() => setEditorOpen(true)}
                        className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                      >
                        تحرير المحتوى
                      </button>
                    </div>
                    <div className="text-xs text-site-muted">
                      {form.content ? `عدد الأحرف: ${form.content.length}` : 'لا يوجد محتوى بعد.'}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? '...' : 'حفظ المسودة'}
                  </button>
                </div>
              </div>

              {selectedChapter && (
                <div className="card">
                  <CommentSection chapterId={selectedChapter.id} />
                </div>
              )}

              <div className="card">
                <h3 className="text-lg font-bold text-site-text heading mb-3">معاينة المحتوى</h3>
                <div className="prose prose-invert max-w-none text-site-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        )}
      </main>
      <QuickArticleModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onArticleCreated={() => {}}
        createViaAPI={false}
        editMode={!!form.title || !!form.content}
        existingDraft={{
          title: form.title || 'عنوان الفصل',
          description: '',
          content: form.content || '',
          slug: activeDraftId || selectedChapter?.id || 'chapter-draft',
        }}
        onDraftCreated={(draft) => {
          setForm((prev) => ({
            ...prev,
            title: draft.title || prev.title,
            content: draft.content,
          }))
        }}
        onDraftChange={(draft) => {
          handleEditorDraftChange(draft)
        }}
      />
    </div>
  )
}
