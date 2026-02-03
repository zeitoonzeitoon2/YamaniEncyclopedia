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

type DiffOp = { type: 'equal' | 'insert' | 'delete'; value: string }

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
  const [votingKey, setVotingKey] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({})
  const autoDraftingRef = useRef(false)
  const chaptersRef = useRef<CourseChapter[]>([])

  const selectedChapter = useMemo(() => chapters.find((c) => c.id === selectedId) || null, [chapters, selectedId])

  const getRootId = (chapter: CourseChapter) => chapter.originalChapterId || chapter.id

  const chapterGroups = useMemo(() => {
    const byRoot = new Map<string, CourseChapter[]>()
    for (const chapter of chapters) {
      const rootId = getRootId(chapter)
      const list = byRoot.get(rootId) || []
      list.push(chapter)
      byRoot.set(rootId, list)
    }

    const groups = Array.from(byRoot.entries()).map(([rootId, list]) => {
      const versions = [...list].sort((a, b) => {
        const va = a.version ?? 0
        const vb = b.version ?? 0
        if (va !== vb) return va - vb
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
      const approvedVersions = versions.filter((c) => c.status === 'APPROVED')
      const approved = approvedVersions.length ? approvedVersions[approvedVersions.length - 1] : null
      const parent = approved || versions[versions.length - 1]
      const orderIndex = Math.min(...versions.map((c) => c.orderIndex ?? 0))
      return { rootId, orderIndex, parent, versions, approved }
    })

    groups.sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      return a.parent.title.localeCompare(b.parent.title)
    })

    return groups
  }, [chapters])

  const selectedApprovedChapter = useMemo(() => {
    if (!selectedChapter) return null
    const rootId = getRootId(selectedChapter)
    const approved = chapters
      .filter((c) => getRootId(c) === rootId && c.status === 'APPROVED')
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0))
    return approved.length ? approved[approved.length - 1] : null
  }, [chapters, selectedChapter?.id])

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
    chaptersRef.current = chapters
  }, [chapters])

  useEffect(() => {
    const current = selectedId ? chaptersRef.current.find((c) => c.id === selectedId) || null : null
    if (!current) return
    setActiveDraftId(current.status === 'PENDING' ? current.id : null)
    autoDraftingRef.current = false
    setForm({
      title: current.title || '',
      content: current.content || '',
      orderIndex: current.orderIndex ?? 0,
      originalChapterId: current.originalChapterId || '',
    })
    setMode('edit')
  }, [selectedId])

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
      resetFormForNew(Math.max(chapterGroups.length - 1, 0))
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

  const chapterLabel = (chapter: CourseChapter) => {
    if (chapter.status === 'APPROVED') return 'معتمد'
    if (chapter.status === 'REJECTED') return 'مرفوض'
    return 'مسودة'
  }

  const versionLabel = (chapter: CourseChapter) => {
    const v = chapter.version ? `v${chapter.version}` : 'v—'
    return `${v} • ${chapterLabel(chapter)}`
  }

  const toggleGroup = (rootId: string) => {
    setExpandedRoots((prev) => ({ ...prev, [rootId]: !prev[rootId] }))
  }

  const pendingChapters = chapters.filter((c) => c.status === 'PENDING')

  const previewDiffOps = useMemo(() => {
    const isPending = selectedChapter?.status === 'PENDING'
    if (!isPending) return null

    const tokenize = (text: string) => text.split(/(\s+)/).filter((t) => t.length > 0)
    const diffTokens = (a: string[], b: string[]): DiffOp[] => {
      const n = a.length
      const m = b.length
      const max = n + m
      const offset = max
      const v0 = new Array(2 * max + 1).fill(0)
      const trace: number[][] = []

      for (let d = 0; d <= max; d++) {
        const v = v0.slice()
        for (let k = -d; k <= d; k += 2) {
          const kIndex = k + offset
          let x: number
          if (k === -d || (k !== d && v0[kIndex - 1] < v0[kIndex + 1])) {
            x = v0[kIndex + 1]
          } else {
            x = v0[kIndex - 1] + 1
          }
          let y = x - k
          while (x < n && y < m && a[x] === b[y]) {
            x++
            y++
          }
          v[kIndex] = x
          if (x >= n && y >= m) {
            trace.push(v)
            d = max + 1
            break
          }
        }
        if (d <= max) {
          trace.push(v)
          for (let i = 0; i < v0.length; i++) v0[i] = v[i]
        }
      }

      let x = n
      let y = m
      const edits: { type: DiffOp['type']; token: string }[] = []
      for (let d = trace.length - 1; d > 0; d--) {
        const prev = trace[d - 1]
        const k = x - y
        const kIndex = k + offset
        let prevK: number
        if (k === -d || (k !== d && prev[kIndex - 1] < prev[kIndex + 1])) {
          prevK = k + 1
        } else {
          prevK = k - 1
        }
        const prevX = prev[prevK + offset]
        const prevY = prevX - prevK

        while (x > prevX && y > prevY) {
          edits.push({ type: 'equal', token: a[x - 1] })
          x--
          y--
        }

        if (x === prevX) {
          edits.push({ type: 'insert', token: b[y - 1] })
          y--
        } else {
          edits.push({ type: 'delete', token: a[x - 1] })
          x--
        }
      }

      while (x > 0 && y > 0) {
        edits.push({ type: 'equal', token: a[x - 1] })
        x--
        y--
      }
      while (x > 0) {
        edits.push({ type: 'delete', token: a[x - 1] })
        x--
      }
      while (y > 0) {
        edits.push({ type: 'insert', token: b[y - 1] })
        y--
      }

      edits.reverse()
      const merged: DiffOp[] = []
      for (const e of edits) {
        const last = merged[merged.length - 1]
        if (last && last.type === e.type) {
          last.value += e.token
        } else {
          merged.push({ type: e.type, value: e.token })
        }
      }
      return merged
    }

    const base = selectedApprovedChapter?.content || ''
    const draft = form.content || ''
    return diffTokens(tokenize(base), tokenize(draft))
  }, [form.content, selectedApprovedChapter?.content, selectedChapter?.status])

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
                    onClick={() => resetFormForNew(chapterGroups.length)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                  >
                    فصل جديد
                  </button>
                </div>
                {chapters.length === 0 ? (
                  <div className="text-site-muted text-sm">لا توجد فصول بعد.</div>
                ) : (
                  <div className="space-y-2">
                    {chapterGroups.map((group, groupIndex) => {
                      const isExpanded = !!expandedRoots[group.rootId]
                      return (
                        <div key={group.rootId} className="p-2 rounded-lg border border-gray-700 bg-site-card/40">
                          <button
                            type="button"
                            onClick={() => {
                              toggleGroup(group.rootId)
                              setSelectedId(group.parent.id)
                              setMode('edit')
                            }}
                            className="w-full text-right"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-site-text text-sm truncate">
                                  {group.parent.title || `الفصل ${group.orderIndex + 1}`}
                                </div>
                                <div className="text-xs text-site-muted mt-1">
                                  #{groupIndex + 1} • {group.versions.length} نسخة
                                </div>
                              </div>
                              <div className="text-xs text-site-muted">{isExpanded ? '▲' : '▼'}</div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {group.versions.map((chapter) => {
                                const isSelected = chapter.id === selectedId
                                return (
                                  <div
                                    key={chapter.id}
                                    className={`p-2 rounded-lg border bg-black/10 ${
                                      isSelected ? 'border-warm-primary/70' : 'border-gray-700'
                                    }`}
                                  >
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
                                          <div className="text-xs text-site-muted mt-1">{versionLabel(chapter)}</div>
                                        </div>
                                        <div className="text-xs text-site-muted">
                                          {new Date(chapter.updatedAt).toLocaleDateString('ar')}
                                        </div>
                                      </div>
                                    </button>
                                    <div className="flex items-center justify-end gap-2 mt-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(chapter.id)}
                                        className="px-2 py-1 text-xs rounded border border-red-600/60 text-red-400 hover:text-red-200"
                                      >
                                        حذف
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
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
                {selectedChapter?.status === 'PENDING' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                      <div className="text-sm text-site-text">
                        النسخة المعتمدة {selectedApprovedChapter?.version ? `v${selectedApprovedChapter.version}` : ''}
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-md bg-black/10 p-3 text-site-text">
                        {selectedApprovedChapter ? (
                          <div className="whitespace-pre-wrap break-words text-sm leading-6">
                            {(previewDiffOps || []).map((op, idx) => {
                              if (op.type === 'insert') return null
                              if (op.type === 'delete') {
                                return (
                                  <span key={idx} className="bg-red-600/20 text-red-200 line-through rounded px-0.5">
                                    {op.value}
                                  </span>
                                )
                              }
                              return <span key={idx}>{op.value}</span>
                            })}
                          </div>
                        ) : (
                          <div className="text-site-muted text-sm">لا توجد نسخة معتمدة بعد.</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                      <div className="text-sm text-site-text">المسودة {selectedChapter.version ? `v${selectedChapter.version}` : ''}</div>
                      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-md bg-black/10 p-3 text-site-text">
                        <div className="whitespace-pre-wrap break-words text-sm leading-6">
                          {(previewDiffOps || []).map((op, idx) => {
                            if (op.type === 'delete') return null
                            if (op.type === 'insert') {
                              return (
                                <span key={idx} className="bg-green-600/20 text-green-200 rounded px-0.5">
                                  {op.value}
                                </span>
                              )
                            }
                            return <span key={idx}>{op.value}</span>
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none text-site-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                )}
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
