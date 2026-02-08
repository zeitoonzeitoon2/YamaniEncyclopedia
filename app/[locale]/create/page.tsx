'use client'

import { useState, useEffect, useRef } from 'react'
import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/lib/navigation'
import { useTranslations } from 'next-intl'
import { Header } from '@/components/Header'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import toast from 'react-hot-toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Node, Edge } from 'reactflow'

// Helper: Identify a "trivial/empty" tree to prevent default saving
type TreeData = { nodes: Node[]; edges: Edge[] }
function isTrivialTree(data: Partial<TreeData> | null | undefined): boolean {
  if (!data || !Array.isArray((data as any).nodes) || !Array.isArray((data as any).edges)) return true
  const nodes = (data as any).nodes as Node[]
  const edges = (data as any).edges as Edge[]
  if (edges.length > 0) return false
  if (nodes.length <= 1) return true
  return false
}

function CreatePost() {
  const t = useTranslations('createPost')
  const tEditor = useTranslations('treeDiagramEditor')
  const tArg = useTranslations('argumentation')
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const draftKey = editId ? `create_tree_draft_v1_edit_${editId}` : 'create_tree_draft_v1'
  const [originalPostId, setOriginalPostId] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [
      {
        id: '1',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: tEditor('startNode') },
      },
    ],
    edges: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [argumentation, setArgumentation] = useState({
    type: '',
    summary: '',
    evidence: '',
    rebuttal: ''
  })

  // Load main diagram with the highest score or restore saved draft
  const hasLoadedRef = useRef(false)
  const skipAutoSaveRef = useRef(false)
  useEffect(() => {
    if (status !== 'authenticated') {
      setIsLoading(false)
      return
    }
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    // If in edit mode via ?edit=ID, first attempt to restore specific draft for this item
    const tryLoadEditTarget = async () => {
      if (!editId) return false
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed?.treeData?.nodes && parsed?.treeData?.edges && !isTrivialTree(parsed.treeData)) {
            setTreeData(parsed.treeData)
            setOriginalPostId(parsed.originalPostId ?? null)
            setIsLoading(false)
            return true
          } else {
            try { localStorage.removeItem(draftKey) } catch {}
          }
        }
      } catch (e) {
        console.warn('Failed to restore edit draft from localStorage', e)
      }

      // If no local draft, fetch target post data (full version)
      try {
        const resp = await fetch(`/api/editor/posts/${editId}`)
        if (resp.ok) {
          const target = await resp.json()
          if (target?.content) {
            try {
              const parsedContent = JSON.parse(target.content)
              setTreeData(parsedContent)
            } catch (e) {
              console.error('Invalid target post content JSON', e)
            }
            // Content from user's previous draft; base edit ID from published version
            setOriginalPostId(target?.originalPost?.id ?? null)
            setIsLoading(false)
            return true
          }
        }
      } catch (e) {
        console.warn('Failed to load target edit post:', e)
      }
      return false
    }

    const loadTopPost = async () => {
      try {
        const response = await fetch('/api/posts/latest', { cache: 'no-store' })
        if (response.ok) {
          const topPost = await response.json()
          if (topPost) {
            setOriginalPostId(topPost.id)
            const parsedContent = JSON.parse(topPost.content)
            setTreeData(parsedContent)
          }
        }
      } catch (error) {
        console.error(`${t('loadError')}:`, error)
        toast.error(t('loadError'))
      } finally {
        setIsLoading(false)
      }
    }

    // Try to load edit path; if unsuccessful, follow previous flow
    ;(async () => {
      const handled = await tryLoadEditTarget()
      if (!handled) {
        // Scenario: Non-edit mode. First get the latest published version, then decide if local draft is valid
        try {
          const resp = await fetch('/api/posts/latest', { cache: 'no-store' })
          const latest = resp.ok ? await resp.json() : null

          if (!editId) {
            try {
              const saved = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
              if (saved) {
                const parsed = JSON.parse(saved)
                const validDraft = parsed?.treeData?.nodes && parsed?.treeData?.edges && !isTrivialTree(parsed.treeData)
                if (validDraft) {
                  const sameBase = !!latest && (parsed.originalPostId === latest.id)
                  if (sameBase) {
                    setTreeData(parsed.treeData)
                    setOriginalPostId(parsed.originalPostId ?? null)
                    setIsLoading(false)
                    return
                  } else {
                    // Draft is for an old version; clear it to load new version
                    try { localStorage.removeItem(draftKey) } catch {}
                  }
                } else {
                  try { localStorage.removeItem(draftKey) } catch {}
                }
              }
            } catch (e) {
              console.warn('Failed to restore draft from localStorage', e)
            }
          }

          if (latest) {
            setOriginalPostId(latest.id)
            try {
              const parsedContent = JSON.parse(latest.content)
              setTreeData(parsedContent)
            } catch (e) {
              console.error('Invalid latest post content JSON', e)
            }
            setIsLoading(false)
            return
          }
        } catch (e) {
          console.warn('Failed to fetch latest approved post', e)
        }

        // If unsuccessful, fallback flow
        await loadTopPost()
      }
    })()
  }, [status, editId, draftKey, t])

  // Auto-save draft in localStorage with every change
  useEffect(() => {
    if (status !== 'authenticated') return
    if (skipAutoSaveRef.current) return
    // Prevent saving completely empty draft (only start node)
    if (isTrivialTree(treeData)) return
    try {
      const payload = { treeData, originalPostId }
      localStorage.setItem(draftKey, JSON.stringify(payload))
    } catch (e) {
      console.warn('Failed to persist draft into localStorage', e)
    }
  }, [treeData, originalPostId, status, draftKey])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center">
        <div className="text-site-text">{t('loading')}</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center">
        <div className="text-site-text">{t('loginRequired')}</div>
      </div>
    )
  }

  const doSubmit = async () => {
    if (treeData.nodes.length === 0) {
      toast.error(t('minNodesError'))
      return
    }
    if (!argumentation.summary.trim() || !argumentation.evidence.trim()) {
      toast.error(tArg('validationError'))
      return
    }
    setIsSubmitting(true)
    try {
      const body: any = {
        content: JSON.stringify({ ...treeData, changeSummary: argumentation.summary.trim() }),
        changeReason: argumentation,
        changeSummary: argumentation.summary.trim(),
        type: 'TREE',
      }
      if (originalPostId) body.originalPostId = originalPostId
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.ok) {
        toast.success(t('submitSuccess'))
        skipAutoSaveRef.current = true
        try { localStorage.removeItem(draftKey) } catch {}
        setTreeData({
          nodes: [
            { id: '1', type: 'custom', position: { x: 400, y: 200 }, data: { label: tEditor('startNode') } },
          ],
          edges: [],
        })
        setArgumentation({ type: '', summary: '', evidence: '', rebuttal: '' })
        setIsSummaryOpen(false)
        router.push('/')
      } else {
        const text = await response.text()
        let err: any = {}
        try { err = JSON.parse(text) } catch { err = { error: text } }
        console.error('Submission failed:', response.status, err)
        toast.error(err?.error ? `${t('submitError')}: ${err.error}` : `${t('submitError')} (${response.status})`)
      }
    } catch (error) {
      console.error('Submission error:', error)
      toast.error(t('submitError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setIsSummaryOpen(true)
  }

  // When user clicks "Cancel", saved draft should be cleared so that next time CREATE page loads from latest published diagram
  const handleCancel = () => {
    try {
      // Prevent auto-save immediately after clearing
      skipAutoSaveRef.current = true
      // Remove current draft
      if (typeof window !== 'undefined') {
        localStorage.removeItem(draftKey)
      }
    } catch {}
    // Optional: Reset temporary local state of this page
    setTreeData({
      nodes: [
        {
          id: '1',
          type: 'custom',
          position: { x: 400, y: 200 },
          data: { label: tEditor('startNode') },
        },
      ],
      edges: [],
    })
    // Go back
    router.push('/')
  }

  if (isSummaryOpen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-2xl my-8">
          <div className="px-6 py-4 border-b border-gray-700/50">
            <h2 className="text-xl font-bold text-site-text heading">{tArg('title')}</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-site-text mb-2">{tArg('typeLabel')} ({tArg('optional')})</label>
              <div className="flex flex-wrap gap-2">
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

            <div>
              <label className="block text-sm font-medium text-site-text mb-2">{tArg('summaryLabel')}</label>
              <textarea
                value={argumentation.summary}
                onChange={(e) => setArgumentation({ ...argumentation, summary: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[80px]"
                placeholder={tArg('summaryPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-site-text mb-2">{tArg('evidenceLabel')}</label>
              <textarea
                value={argumentation.evidence}
                onChange={(e) => setArgumentation({ ...argumentation, evidence: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[80px]"
                placeholder={tArg('evidencePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-site-text mb-2">{tArg('rebuttalLabel')} ({tArg('optional')})</label>
              <textarea
                value={argumentation.rebuttal}
                onChange={(e) => setArgumentation({ ...argumentation, rebuttal: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                rows={3}
                placeholder={tArg('rebuttalPlaceholder')}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700/50">
              <button
                type="button"
                onClick={() => { setIsSummaryOpen(false) }}
                className="px-4 py-2 rounded-lg text-site-text hover:bg-site-bg transition-colors"
              >
                {tArg('cancel')}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={doSubmit}
                className="btn-primary"
              >
                {isSubmitting ? t('submitting') : tArg('submit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="px-4 py-8">
        <div className="max-w-none">
          <h1 className="text-3xl font-bold text-site-text mb-8 text-center">
            {originalPostId ? t('editTitle') : t('title')}
          </h1>

          {/* Top action bar */}
          <div className="flex gap-4 mb-4 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e as any)}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('submitting') : (originalPostId ? t('submitChanges') : t('submit'))}
            </button>
          </div>

          <div className="card">
            <div className="mb-6">
              <label className="block text-site-text font-medium mb-2">
                {t('treeDiagramLabel')}
              </label>
              <div className="text-sm text-gray-400 mb-4">
                {originalPostId 
                  ? t('loadMainDesc')
                  : t('createMainDesc')
                }
              </div>
              <div className="w-full min-h-[150vh]">
                <ErrorBoundary fallback={<div className="p-4 text-red-500 border border-red-300 rounded bg-red-50">{t('treeDiagramLabel')} - {t('loadError')}</div>}>
                  <TreeDiagramEditor
                    initialData={treeData}
                    onDataChange={setTreeData}
                    height="150vh"
                    collectDrafts={false}
                    isCreatePage={true}
                  />
                </ErrorBoundary>
              </div>
            </div>

            {/* Bottom buttons were removed and moved to the top */}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function CreatePostPage() {
  const t = useTranslations('createPost')
  return (
    <Suspense fallback={<div className="min-h-screen bg-site-bg flex items-center justify-center"><div className="text-site-text">{t('loading')}</div></div>}>
      <CreatePost />
    </Suspense>
  )
}
