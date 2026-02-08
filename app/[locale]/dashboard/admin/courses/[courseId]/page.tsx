'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/lib/navigation'
import { useSession } from 'next-auth/react'
import { Header } from '@/components/Header'
import CommentSection from '@/components/CommentSection'
import QuickArticleModal from '@/components/QuickArticleModal'
import EnhancedDiagramComparison from '@/components/EnhancedDiagramComparison'
import { useTranslations, useLocale } from 'next-intl'
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
  changeReason?: {
    type: string
    summary: string
    evidence: string
    rebuttal: string
  } | null
  createdAt: string
  updatedAt: string
  author: ChapterAuthor
  votes: ChapterVote[]
  quizQuestions?: any
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
  const t = useTranslations('adminCourses')
  const tArg = useTranslations('argumentation')
  const locale = useLocale()
  const params = useParams() as { courseId?: string }
  const courseId = params?.courseId || ''
  const router = useRouter()
  const { data: session, status } = useSession()

  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [chapters, setChapters] = useState<CourseChapter[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('new')
  const [form, setForm] = useState({ title: '', content: '', orderIndex: 0, originalChapterId: '', quizQuestions: [] as any[] })
  const [argumentation, setArgumentation] = useState({
    type: '',
    summary: '',
    evidence: '',
    rebuttal: ''
  })
  const [showArgModal, setShowArgModal] = useState(false)
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
  }, [chapters, selectedChapter])

  const resetFormForNew = (nextOrderIndex: number) => {
    setMode('new')
    setSelectedId(null)
    setForm({ title: '', content: '', orderIndex: nextOrderIndex, originalChapterId: '', quizQuestions: [] })
    setActiveDraftId(null)
    autoDraftingRef.current = false
  }

  const fetchChapters = useCallback(async () => {
    if (!courseId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as Partial<ChaptersResponse> & { error?: string }
      if (!res.ok) {
        toast.error(data.error || t('toast.fetchError'))
        return
      }
      setCourse(data.course || null)
      setChapters(Array.isArray(data.chapters) ? data.chapters : [])
      if (!selectedId && Array.isArray(data.chapters) && data.chapters.length > 0) {
        setSelectedId(data.chapters[0].id)
        setMode('edit')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.fetchError')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [courseId, selectedId, t])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    fetchChapters()
  }, [session, status, router, fetchChapters])

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
      quizQuestions: Array.isArray(current.quizQuestions) ? current.quizQuestions : [],
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
        toast.error(payload.error || t('toast.draftCreateError'))
        return
      }
      if (payload.chapter?.id) {
        setActiveDraftId(payload.chapter.id)
      }
      setMode('edit')
      await fetchChapters()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.draftCreateError')
      toast.error(msg)
    } finally {
      autoDraftingRef.current = false
    }
  }

  const handleSave = async () => {
    const title = form.title.trim()
    const content = form.content.trim()
    const hasQuiz = Array.isArray(form.quizQuestions) && form.quizQuestions.length > 0
    
    if (!title || (!content && !hasQuiz)) {
      toast.error(t('toast.requiredFields'))
      return
    }
    
    // Only show argumentation form for editors or users (non-admins) when proposing changes
    if (session?.user?.role !== 'ADMIN') {
      setShowArgModal(true)
    } else {
      await doSave()
    }
  }

  const doSave = async () => {
    if (!courseId) return
    const title = form.title.trim()
    const content = form.content.trim()
    
    try {
      setSaving(true)
      
      // Determine if we should update an existing record or create a new one
      // 1. If we already have an active draft ID, update that draft.
      // 2. If we are in edit mode and the selected chapter is NOT approved, update it directly.
      // 3. Otherwise (new mode OR editing an approved chapter), create a new record (POST).
      let targetId = activeDraftId
      if (!targetId && mode === 'edit' && selectedChapter && selectedChapter.status !== 'APPROVED') {
        targetId = selectedId
      }

      const body: any = { 
        title, 
        content, 
        orderIndex: form.orderIndex,
        quizQuestions: form.quizQuestions,
        changeReason: session?.user?.role !== 'ADMIN' ? argumentation : undefined
      }

      if (targetId) {
        const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/${targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(payload.error || t('toast.saveError'))
          return
        }
      } else {
        // Create new chapter OR new version of an approved chapter
        const rootId = selectedChapter ? getRootId(selectedChapter) : ''
        
        const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            originalChapterId: rootId || form.originalChapterId || undefined,
          }),
        })
        const payload = (await res.json().catch(() => ({}))) as { error?: string; chapter?: { id: string } }
        if (!res.ok) {
          toast.error(payload.error || t('toast.draftCreateError'))
          return
        }
        
        // If we created a new version, select it
        if (payload.chapter?.id) {
          setSelectedId(payload.chapter.id)
        }
      }
      await fetchChapters()
      toast.success(t('toast.saveSuccess'))
      setShowArgModal(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.saveError')
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
        toast.error(payload.error || t('toast.deleteError'))
        return
      }
      setSelectedId(null)
      resetFormForNew(Math.max(chapterGroups.length - 1, 0))
      await fetchChapters()
      toast.success(t('toast.deleteSuccess'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.deleteError')
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
        toast.error(payload.error || t('toast.voteError'))
        return
      }
      await fetchChapters()
      toast.success(t('toast.voteSuccess'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.voteError')
      toast.error(msg)
    } finally {
      setVotingKey(null)
    }
  }

  const addQuizQuestion = () => {
    const newQuestion = {
      id: crypto.randomUUID(),
      question: '',
      options: ['', '', '', ''],
      correctAnswer: 0
    }
    setForm(prev => ({
      ...prev,
      quizQuestions: [...prev.quizQuestions, newQuestion]
    }))
  }

  const removeQuizQuestion = (id: string) => {
    setForm(prev => ({
      ...prev,
      quizQuestions: prev.quizQuestions.filter((q: any) => q.id !== id)
    }))
  }

  const updateQuizQuestion = (id: string, updates: any) => {
    setForm(prev => ({
      ...prev,
      quizQuestions: prev.quizQuestions.map((q: any) => 
        q.id === id ? { ...q, ...updates } : q
      )
    }))
  }

  const chapterLabel = (chapter: CourseChapter) => {
    if (chapter.status === 'APPROVED') return t('statusApproved')
    if (chapter.status === 'REJECTED') return t('statusRejected')
    return t('statusDraft')
  }

  const formatVersionTag = (version?: number | null) => {
    if (version) return t('versionTag', { number: version })
    return t('versionTagEmpty')
  }

  const versionLabel = (chapter: CourseChapter) => {
    const v = formatVersionTag(chapter.version)
    return `${v} • ${chapterLabel(chapter)}`
  }

  const toggleGroup = (rootId: string) => {
    setExpandedRoots((prev) => ({ ...prev, [rootId]: !prev[rootId] }))
  }

  const pendingChapters = chapters.filter((c) => c.status === 'PENDING')

  const selectChapterById = (chapterId: string) => {
    const target = chaptersRef.current.find((c) => c.id === chapterId) || null
    if (!target) return
    const rootId = getRootId(target)
    setExpandedRoots((prev) => ({ ...prev, [rootId]: true }))
    setSelectedId(chapterId)
    setMode('edit')
  }

  const selectedPreviousChapter = useMemo(() => {
    if (!selectedChapter) return null
    const rootId = getRootId(selectedChapter)
    const versions = chapters
      .filter((c) => getRootId(c) === rootId)
      .sort((a, b) => {
        const va = a.version ?? 0
        const vb = b.version ?? 0
        if (va !== vb) return va - vb
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    const idx = versions.findIndex((c) => c.id === selectedChapter.id)
    if (idx <= 0) return null
    return versions[idx - 1]
  }, [chapters, selectedChapter])

  const previewDiffOps = useMemo(() => {
    if (!selectedChapter) return null
    if (!selectedPreviousChapter) return null

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

    const base = selectedPreviousChapter?.content || ''
    const current = form.content || ''
    return diffTokens(tokenize(base), tokenize(current))
  }, [form.content, selectedChapter, selectedPreviousChapter])

  const parsedDiagramForPreview = useMemo(() => {
    const unwrapFence = (text: string) => {
      const trimmed = (text || '').trim()
      if (!trimmed.startsWith('```')) return trimmed
      const lines = trimmed.split('\n')
      if (lines.length < 3) return trimmed
      if (!lines[lines.length - 1].trim().startsWith('```')) return trimmed
      return lines.slice(1, -1).join('\n').trim()
    }

    const tryParseDiagram = (text: string): { nodes: any[]; edges: any[] } | null => {
      try {
        const raw = unwrapFence(text)
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const nodes = (parsed as any).nodes
        const edges = (parsed as any).edges
        if (!Array.isArray(nodes) || !Array.isArray(edges)) return null
        return { nodes, edges }
      } catch {
        return null
      }
    }

    const previous = selectedPreviousChapter ? tryParseDiagram(selectedPreviousChapter.content || '') : null
    const current = selectedChapter ? tryParseDiagram(form.content || '') : null
    return { previous, current }
  }, [form.content, selectedChapter, selectedPreviousChapter])

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{t('title')}</h1>
            {course && (
              <p className="text-site-muted mt-2">{course.title}</p>
            )}
          </div>
          <button type="button" onClick={() => router.push('/dashboard/admin')} className="btn-secondary">
            {t('backToAdmin')}
          </button>
        </div>

        {loading ? (
          <div className="text-site-muted">{t('loading')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-site-text heading">{t('chapters')}</h3>
                  <button
                    type="button"
                    onClick={() => resetFormForNew(chapterGroups.length)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                  >
                    {t('newChapter')}
                  </button>
                </div>
                {chapters.length === 0 ? (
                  <div className="text-site-muted text-sm">{t('noChapters')}</div>
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
                              selectChapterById(group.parent.id)
                            }}
                            className="w-full text-right"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-site-text text-sm truncate">
                                  {group.parent.title || t('chapterNumber', { number: group.orderIndex + 1 })}
                                </div>
                                <div className="text-xs text-site-muted mt-1">
                                  #{groupIndex + 1} • {t('versionCount', { count: group.versions.length })}
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
                                        selectChapterById(chapter.id)
                                      }}
                                      className="w-full text-right"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="text-site-text text-sm truncate">{chapter.title}</div>
                                          <div className="text-xs text-site-muted mt-1">{versionLabel(chapter)}</div>
                                        </div>
                                        <div className="text-xs text-site-muted">
                                          {new Date(chapter.updatedAt).toLocaleDateString(locale)}
                                        </div>
                                      </div>
                                    </button>
                                    <div className="flex items-center justify-end gap-2 mt-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(chapter.id)}
                                        className="px-2 py-1 text-xs rounded border border-red-600/60 text-red-400 hover:text-red-200"
                                      >
                                        {t('delete')}
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
                  <h3 className="text-lg font-bold text-site-text heading">{t('requiredVotes')}</h3>
                  {pendingChapters.map((chapter) => (
                    <div key={chapter.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                      <button
                        type="button"
                        onClick={() => selectChapterById(chapter.id)}
                        className="w-full text-right"
                      >
                        <div className="text-site-text text-sm">{chapter.title}</div>
                        <div className="text-xs text-site-muted mt-1">{versionLabel(chapter)}</div>
                      </button>
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
                          {votingKey === `${chapter.id}:APPROVE` ? '...' : t('approve')}
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
                          {votingKey === `${chapter.id}:REJECT` ? '...' : t('reject')}
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
                    {mode === 'new' ? t('modeNew') : mode === 'revision' ? t('modeRevision') : t('modeEdit')}
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
                    placeholder={t('chapterTitlePlaceholder')}
                    className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-site-muted">{t('orderLabel')}</span>
                    <input
                      type="number"
                      value={form.orderIndex}
                      onChange={(e) => setForm((prev) => ({ ...prev, orderIndex: Number(e.target.value) }))}
                      className="w-24 p-2 rounded border border-gray-600 bg-site-bg text-site-text"
                    />
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-site-text">{t('contentLabel')}</div>
                      <button
                        type="button"
                        onClick={() => setEditorOpen(true)}
                        className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                      >
                        {t('editContent')}
                      </button>
                    </div>
                    <div className="text-xs text-site-muted">
                      {form.content ? t('charCount', { count: form.content.length }) : t('noContent')}
                    </div>
                  </div>

                  {/* Quiz Editor */}
                  <div className="rounded-lg border border-gray-700 bg-site-card/40 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-md font-bold text-site-text heading">{t('quizTitle')}</h4>
                      <button
                        type="button"
                        onClick={addQuizQuestion}
                        className="px-3 py-1 text-xs rounded-lg border border-warm-primary/40 bg-warm-primary/10 hover:bg-warm-primary/20 text-site-text"
                      >
                        {t('addQuestion')}
                      </button>
                    </div>
                    
                    {form.quizQuestions.length === 0 ? (
                      <div className="text-xs text-site-muted italic text-center py-2">
                        {t('noQuizQuestions', { defaultValue: 'No questions added yet.' })}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {form.quizQuestions.map((q: any, qIdx: number) => (
                          <div key={q.id} className="p-3 rounded-lg border border-gray-700 bg-black/20 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs text-site-muted font-mono">Q{qIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeQuizQuestion(q.id)}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                {t('removeQuestion')}
                              </button>
                            </div>
                            <input
                              value={q.question}
                              onChange={(e) => updateQuizQuestion(q.id, { question: e.target.value })}
                              placeholder={t('questionPlaceholder')}
                              className="w-full p-2 text-sm rounded border border-gray-600 bg-site-bg text-site-text"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.options.map((opt: string, oIdx: number) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    checked={q.correctAnswer === oIdx}
                                    onChange={() => updateQuizQuestion(q.id, { correctAnswer: oIdx })}
                                    className="text-warm-primary focus:ring-warm-primary bg-site-bg border-gray-600"
                                  />
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      const newOpts = [...q.options]
                                      newOpts[oIdx] = e.target.value
                                      updateQuizQuestion(q.id, { options: newOpts })
                                    }}
                                    placeholder={t('optionPlaceholder', { index: oIdx + 1 })}
                                    className="flex-1 p-2 text-xs rounded border border-gray-600 bg-site-bg text-site-text"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? '...' : t('saveDraft')}
                  </button>
                </div>
              </div>

              {selectedChapter && (
                <div className="card">
                  <CommentSection chapterId={selectedChapter.id} />
                </div>
              )}

              <div className="card">
                <h3 className="text-lg font-bold text-site-text heading mb-3">{t('previewContent')}</h3>
                
                {/* Reasoning Card */}
                {selectedChapter?.changeReason && (
                  <div className="mb-6 p-4 rounded-xl border border-warm-primary/20 bg-warm-primary/5 text-site-text shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-warm-primary/10 pb-3 gap-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-warm-primary/10 rounded-lg text-warm-accent">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        </div>
                        <h4 className="font-bold text-base heading m-0 text-warm-accent">{tArg('title')}</h4>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Right Side: Summary (1/3) */}
                      <div className="md:col-span-1 space-y-3 order-1 md:order-2">
                        <div className="bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 h-full">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('summaryLabel')}</div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed text-site-text">
                            {selectedChapter.changeReason.summary}
                          </div>
                        </div>
                      </div>

                      {/* Left Side: Evidence (2/3) */}
                      <div className="md:col-span-2 space-y-3 order-2 md:order-1">
                        <div className="bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 h-full">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('evidenceLabel')}</div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed text-site-text">
                            {selectedChapter.changeReason.evidence}
                          </div>
                        </div>
                      </div>

                      {/* Rebuttal: Full width if exists and not empty */}
                      {selectedChapter.changeReason.rebuttal && selectedChapter.changeReason.rebuttal.trim().length > 0 && (
                        <div className="md:col-span-3 bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 order-3">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('rebuttalLabel')}</div>
                          <div className="text-sm whitespace-pre-wrap italic text-site-text/90">
                            {selectedChapter.changeReason.rebuttal}
                          </div>
                        </div>
                      )}

                      {/* Change Type: Only if not empty */}
                      {selectedChapter.changeReason.type && selectedChapter.changeReason.type.trim().length > 0 && (
                        <div className="md:col-span-3 bg-site-bg/40 p-2 rounded-lg border border-warm-primary/10 order-4 flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-site-muted">{tArg('typeLabel')}:</span>
                          <span className="text-xs font-medium text-warm-primary px-2 py-0.5 bg-warm-primary/10 rounded-full">
                            {tArg(`types.${selectedChapter.changeReason.type}`)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedChapter && selectedPreviousChapter && parsedDiagramForPreview.previous && parsedDiagramForPreview.current ? (
                  <EnhancedDiagramComparison
                    originalData={parsedDiagramForPreview.previous}
                    proposedData={parsedDiagramForPreview.current}
                  />
                ) : selectedChapter && selectedPreviousChapter ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                      <div className="text-sm text-site-text">
                        {t('previousVersion')} {selectedPreviousChapter ? formatVersionTag(selectedPreviousChapter.version) : ''}
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-md bg-black/10 p-3 text-site-text">
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
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-site-card/40 p-3 space-y-2">
                      <div className="text-sm text-site-text">
                        {t('selectedVersion')} {formatVersionTag(selectedChapter.version)}
                      </div>
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

      {/* Argumentation Modal */}
      {showArgModal && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-700/50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-site-text heading">{tArg('title')}</h2>
              <button onClick={() => setShowArgModal(false)} className="text-site-muted hover:text-site-text">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Change Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-site-text">{tArg('typeLabel')} ({tArg('optional')})</label>
                <div className="grid grid-cols-2 gap-2">
                  {['fact', 'logic', 'structure', 'style'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setArgumentation(prev => ({ ...prev, type: prev.type === type ? '' : type }))}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        argumentation.type === type 
                          ? 'border-warm-primary bg-warm-primary/10 text-warm-accent' 
                          : 'border-gray-700 bg-site-card/40 text-site-muted hover:border-gray-600'
                      }`}
                    >
                      {tArg(`types.${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-site-text">{tArg('summaryLabel')}</label>
                <textarea
                  value={argumentation.summary}
                  onChange={(e) => setArgumentation(prev => ({ ...prev, summary: e.target.value }))}
                  className="w-full bg-site-card border border-gray-700 rounded-lg p-3 text-sm text-site-text focus:ring-2 focus:ring-warm-primary outline-none min-h-[80px]"
                  placeholder={tArg('summaryPlaceholder')}
                />
              </div>

              {/* Evidence */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-site-text">{tArg('evidenceLabel')}</label>
                <textarea
                  value={argumentation.evidence}
                  onChange={(e) => setArgumentation(prev => ({ ...prev, evidence: e.target.value }))}
                  className="w-full bg-site-card border border-gray-700 rounded-lg p-3 text-sm text-site-text focus:ring-2 focus:ring-warm-primary outline-none min-h-[80px]"
                  placeholder={tArg('evidencePlaceholder')}
                />
              </div>

              {/* Rebuttal */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-site-text">{tArg('rebuttalLabel')} ({tArg('optional')})</label>
                <textarea
                  value={argumentation.rebuttal}
                  onChange={(e) => setArgumentation(prev => ({ ...prev, rebuttal: e.target.value }))}
                  className="w-full bg-site-card border border-gray-700 rounded-lg p-3 text-sm text-site-text focus:ring-2 focus:ring-warm-primary outline-none min-h-[60px]"
                  placeholder={tArg('rebuttalPlaceholder')}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700/50 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setShowArgModal(false)} 
                className="btn-secondary"
                disabled={saving}
              >
                {tArg('cancel')}
              </button>
              <button 
                type="button" 
                onClick={doSave} 
                className="btn-primary"
                disabled={saving || !argumentation.summary.trim() || !argumentation.evidence.trim()}
              >
                {saving ? '...' : tArg('submit')}
              </button>
            </div>
          </div>
        </div>
      )}
      <QuickArticleModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onArticleCreated={() => {}}
        createViaAPI={false}
        editMode={!!form.title || !!form.content}
        existingDraft={{
          title: form.title || t('chapterTitlePlaceholder'),
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
