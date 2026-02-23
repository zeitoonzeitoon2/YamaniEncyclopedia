'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import DiagramComparison from './DiagramComparison'
import EmbeddedArticleViewer from './EmbeddedArticleViewer'

interface ArticleDraft {
  id: string
  title: string
  content: string
  slug: string
  description?: string
  originalArticleSlug?: string
}

interface ArticlesData {
  version: string
  type: string
  drafts: ArticleDraft[]
}

interface EnhancedDiagramComparisonProps {
  originalData: { nodes: any[]; edges: any[] }
  proposedData: { nodes: any[]; edges: any[] }
  articlesData?: string
  onStatsChange?: (stats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => void
}

export default function EnhancedDiagramComparison({
  originalData,
  proposedData,
  articlesData,
  onStatsChange,
}: EnhancedDiagramComparisonProps) {
  const t = useTranslations('enhancedDiagramComparison')
  console.log('EnhancedDiagramComparison rendered with:', { originalData, proposedData, articlesData })
  const [showArticleComparison, setShowArticleComparison] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<ArticleDraft | null>(null)
  const [originalArticle, setOriginalArticle] = useState<any>(null)
  const [loadingOriginal, setLoadingOriginal] = useState(false)

  // Analyze article data
  const parsedArticlesData: ArticlesData | null = React.useMemo(() => {
    if (!articlesData) return null
    try {
      return JSON.parse(articlesData)
    } catch {
      return null
    }
  }, [articlesData])

  // Helper tool to extract slug from links like /articles/...
  const extractSlug = React.useCallback((link?: string | null) => {
    if (!link) return null
    try {
      // Remove query parameters and hash
      const clean = link.split('?')[0].split('#')[0]
      // If provided as a full URL (e.g., http://.../articles/slug)
      const idx = clean.indexOf('/articles/')
      if (idx !== -1) {
        return decodeURIComponent(clean.substring(idx + '/articles/'.length))
      }
      // If it's just the slug itself
      return decodeURIComponent(clean.replace(/^\/+/, ''))
    } catch {
      return null
    }
  }, [])

  // Fetch original article for comparison
  const fetchOriginalArticle = React.useCallback(async (slug: string) => {
    setLoadingOriginal(true)
    try {
      const response = await fetch(`/api/articles/${slug}`)
      if (response.ok) {
        const article = await response.json()
        setOriginalArticle(article)
      } else {
        console.error(t('errorFetchingOriginal'))
        setOriginalArticle(null)
      }
    } catch (error) {
      console.error(t('errorFetchingOriginal'), error)
      setOriginalArticle(null)
    } finally {
      setLoadingOriginal(false)
    }
  }, [t])

  const handleDraftSelect = React.useCallback((draft: ArticleDraft) => {
    setSelectedDraft(draft)
    if (draft.originalArticleSlug) {
      fetchOriginalArticle(draft.originalArticleSlug)
    }
    setShowArticleComparison(true)
  }, [fetchOriginalArticle])

  // Function to display article comparison via the diagram
  const handleShowArticleComparison = React.useCallback((originalLink?: string, proposedLink?: string) => {
    console.log('handleShowArticleComparison called with:', { originalLink, proposedLink })

    const originalLinkStr = originalLink ?? ''
    const proposedLinkStr = proposedLink ?? ''

    // Attempt to fetch the original article using the current link
    const originalSlug = extractSlug(originalLinkStr)
    if (originalSlug) {
      fetchOriginalArticle(originalSlug)
    }
    
    // proposedLink may now be previousArticleLink (old article link)
    const cleanedProposed = (proposedLinkStr || '').split('?')[0].split('#')[0]

    // 1) First search for id/slug within drafts data (backward compatibility)
    if (parsedArticlesData?.drafts && cleanedProposed) {
      const draft = parsedArticlesData.drafts.find(d => d.id === cleanedProposed || d.slug === cleanedProposed)
      if (draft) {
        console.log('Found draft in articlesData:', draft)
        handleDraftSelect(draft)
        return
      }
    }

    // 2) If proposedLink is similar to a draft identifier (without /articles/)
    if (cleanedProposed && !cleanedProposed.includes('/articles/')) {
      (async () => {
        try {
          const res = await fetch(`/api/drafts/${cleanedProposed}`)
          if (res.ok) {
            const draft = await res.json()
            console.log('Fetched draft by id:', draft)
            setSelectedDraft(draft)
            if (draft?.originalArticleSlug) {
              fetchOriginalArticle(draft.originalArticleSlug)
            }
            setShowArticleComparison(true)
            return
          }
        } catch (e) {
          console.warn('Failed to fetch draft by id, will try as published article slug.', e)
        }

        // If unsuccessful, try it as a published article
        const proposedSlug = extractSlug(cleanedProposed)
        if (proposedSlug) {
          try {
            const res2 = await fetch(`/api/articles/${proposedSlug}`)
            if (res2.ok) {
              const article = await res2.json()
              const draftLike: ArticleDraft = {
                id: article.id ?? proposedSlug,
                title: article.title ?? proposedSlug,
                slug: article.slug ?? proposedSlug,
                content: article.content ?? '',
                description: article.description ?? undefined,
                originalArticleSlug: originalSlug ?? undefined,
              }
              setSelectedDraft(draftLike)
            } else {
              console.warn(t('proposedArticleNotFound'))
              setSelectedDraft(null)
            }
          } catch (e) {
            console.error(t('errorFetchingProposed'), e)
            setSelectedDraft(null)
          } finally {
            setShowArticleComparison(true)
          }
        } else {
          setShowArticleComparison(true)
        }
      })()
      return
    }

    // 3) If previousArticleLink (contains /articles/), fetch it as a previous article
    const proposedSlug = extractSlug(proposedLinkStr)
    if (proposedSlug) {
      (async () => {
        try {
          const res = await fetch(`/api/articles/${proposedSlug}`)
          if (res.ok) {
            const article = await res.json()
            const draftLike: ArticleDraft = {
              id: article.id ?? proposedSlug,
              title: article.title ?? proposedSlug,
              slug: article.slug ?? proposedSlug,
              content: article.content ?? '',
              description: article.description ?? undefined,
              originalArticleSlug: originalSlug ?? undefined,
            }
            setSelectedDraft(draftLike)
          } else {
            console.warn(t('proposedArticleNotFound'))
            setSelectedDraft(null)
          }
        } catch (e) {
          console.error(t('errorFetchingProposed'), e)
          setSelectedDraft(null)
        } finally {
          setShowArticleComparison(true)
        }
      })()
    } else {
      setShowArticleComparison(true)
    }
  }, [extractSlug, parsedArticlesData?.drafts, fetchOriginalArticle, handleDraftSelect, t])

  // Upgrade article statistics based on drafts to calculate edits
  const handleStatsFromDiagram = React.useCallback((incomingStats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => {
    if (!onStatsChange) return

    // 1) Collect article edits from drafts (presence of originalArticleSlug)
    const editedDraftSlugs = new Set<string>()
    if (parsedArticlesData?.drafts && Array.isArray(parsedArticlesData.drafts)) {
      parsedArticlesData.drafts.forEach((d) => {
        const slug = (d.originalArticleSlug || '').trim()
        if (slug) editedDraftSlugs.add(slug)
      })
    }

    // 2) Calculate article link changes on nodes and extract slug to avoid double counting
    const getSlugFromNodeData = (data: any): string => {
      try {
        const d = data || {}
        const draft = d.articleDraft || {}
        if (typeof draft?.slug === 'string' && draft.slug.trim()) return draft.slug.trim()
        if (typeof draft?.id === 'string' && draft.id.trim()) return draft.id.trim()
        if (typeof d.articleLink === 'string' && d.articleLink.trim()) return extractSlug(d.articleLink.trim()) || ''
        // Note: We no longer rely on previousArticleLink as a fallback so statistics reflect current state
        return ''
      } catch {
        return ''
      }
    }

    const originalLinks = new Map<string, string>(originalData.nodes.map((n: any) => [n.id, getSlugFromNodeData(n?.data)]))
    const proposedLinks = new Map<string, string>(proposedData.nodes.map((n: any) => [n.id, getSlugFromNodeData(n?.data)]))

    const allIds = new Set<string>([...Array.from(originalLinks.keys()), ...Array.from(proposedLinks.keys())])
    const editedByLinkSlugs = new Set<string>()
    allIds.forEach((id) => {
      const o = (originalLinks.get(id) || '')
      const p = (proposedLinks.get(id) || '')
      if (o && p && o !== p) {
        // Change article connection for this node
        editedByLinkSlugs.add(o)
      }
    })

    // 3) Consolidate the two groups for final "Article Edits" statistics
    const unionEditedCount = new Set<string>([
      ...Array.from(editedByLinkSlugs),
      ...Array.from(editedDraftSlugs),
    ]).size

    const mergedStats = {
      ...incomingStats,
      articles: {
        ...incomingStats.articles,
        edited: unionEditedCount,
      },
    }

    onStatsChange(mergedStats)
  }, [onStatsChange, parsedArticlesData?.drafts, originalData.nodes, proposedData.nodes, extractSlug])

  return (
    <div>
      {/* Diagram comparison */}
      <DiagramComparison
        originalData={originalData}
        proposedData={proposedData}
        onShowArticleComparison={handleShowArticleComparison}
        onStatsChange={handleStatsFromDiagram}
      />

      {/* Drafts list (only when data is available) */}
      {parsedArticlesData && parsedArticlesData.drafts && parsedArticlesData.drafts.length > 0 && (
        <div className="mt-8">
          <h4 className="font-bold text-lg text-site-text mb-4">{t('proposedArticles')}</h4>
          <div className="grid gap-4 mb-6">
            {parsedArticlesData.drafts.map((draft) => (
              <div key={draft.id} className="card border border-gray-600">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h5 className="font-semibold text-site-text">{draft.title}</h5>
                    <p className="text-sm text-site-muted mt-1">
                      {t('slugLabel')} {draft.slug}
                    </p>
                    {draft.description && (
                      <p className="text-sm text-site-muted mt-1">
                        {draft.description}
                      </p>
                    )}
                    {draft.originalArticleSlug && (
                      <p className="text-xs text-blue-400 mt-1">
                        {t('editArticleLabel')} {draft.originalArticleSlug}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDraftSelect(draft)}
                    className="btn-primary text-sm"
                  >
                    {t('compare')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Article comparison window */}
      {showArticleComparison && (
        <EmbeddedArticleViewer
          originalArticleLink={selectedDraft?.originalArticleSlug}
          proposedArticleLink={selectedDraft?.slug || selectedDraft?.id}
          articlesData={articlesData}
          proposedContent={selectedDraft?.content}
          postContent={JSON.stringify(proposedData)}
          onClose={() => setShowArticleComparison(false)}
        />
      )}
    </div>
  )
}