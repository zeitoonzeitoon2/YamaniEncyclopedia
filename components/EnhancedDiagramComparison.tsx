'use client'

import React, { useState } from 'react'
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
  console.log('EnhancedDiagramComparison rendered with:', { originalData, proposedData, articlesData })
  const [showArticleComparison, setShowArticleComparison] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<ArticleDraft | null>(null)
  const [originalArticle, setOriginalArticle] = useState<any>(null)
  const [loadingOriginal, setLoadingOriginal] = useState(false)

  // پارس کردن داده‌های مقالات
  const parsedArticlesData: ArticlesData | null = React.useMemo(() => {
    if (!articlesData) return null
    try {
      return JSON.parse(articlesData)
    } catch {
      return null
    }
  }, [articlesData])

  // ابزار کمکی برای استخراج اسلاگ از لینک های /articles/...
  const extractSlug = React.useCallback((link?: string | null) => {
    if (!link) return null
    try {
      // حذف کوئری‌استرینگ و هَش
      const clean = link.split('?')[0].split('#')[0]
      // اگر به صورت کامل آمده باشد (مثلاً http://.../articles/slug)
      const idx = clean.indexOf('/articles/')
      if (idx !== -1) {
        return decodeURIComponent(clean.substring(idx + '/articles/'.length))
      }
      // اگر صرفاً خود اسلاگ باشد
      return decodeURIComponent(clean.replace(/^\/+/, ''))
    } catch {
      return null
    }
  }, [])

  // دریافت مقاله اصلی برای مقایسه
  const fetchOriginalArticle = React.useCallback(async (slug: string) => {
    setLoadingOriginal(true)
    try {
      const response = await fetch(`/api/articles/${slug}`)
      if (response.ok) {
        const article = await response.json()
        setOriginalArticle(article)
      } else {
        console.error('خطا در دریافت مقاله اصلی')
        setOriginalArticle(null)
      }
    } catch (error) {
      console.error('خطا در دریافت مقاله اصلی:', error)
      setOriginalArticle(null)
    } finally {
      setLoadingOriginal(false)
    }
  }, [])

  const handleDraftSelect = React.useCallback((draft: ArticleDraft) => {
    setSelectedDraft(draft)
    if (draft.originalArticleSlug) {
      fetchOriginalArticle(draft.originalArticleSlug)
    }
    setShowArticleComparison(true)
  }, [fetchOriginalArticle])

  // تابع برای نمایش مقایسه مقاله از طریق diagram
  const handleShowArticleComparison = React.useCallback((originalLink?: string, proposedLink?: string) => {
    console.log('handleShowArticleComparison called with:', { originalLink, proposedLink })

    const originalLinkStr = originalLink ?? ''
    const proposedLinkStr = proposedLink ?? ''

    // تلاش برای دریافت مقاله اصلی با استفاده از لینک فعلی
    const originalSlug = extractSlug(originalLinkStr)
    if (originalSlug) {
      fetchOriginalArticle(originalSlug)
    }
    
    // proposedLink اکنون ممکن است previousArticleLink (یک لینک مقاله قدیمی) باشد
    const cleanedProposed = (proposedLinkStr || '').split('?')[0].split('#')[0]

    // 1) ابتدا در داده‌های drafts به دنبال id/slug بگردیم (سازگاری عقب‌رو)
    if (parsedArticlesData?.drafts && cleanedProposed) {
      const draft = parsedArticlesData.drafts.find(d => d.id === cleanedProposed || d.slug === cleanedProposed)
      if (draft) {
        console.log('Found draft in articlesData:', draft)
        handleDraftSelect(draft)
        return
      }
    }

    // 2) اگر proposedLink شبیه شناسه پیش‌نویس است (بدون /articles/)
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

        // اگر نشد، به عنوان مقاله منتشر شده امتحان کن
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
              console.warn('مقاله پیشنهادی یافت نشد یا منتشر نشده است')
              setSelectedDraft(null)
            }
          } catch (e2) {
            console.error('خطا در دریافت مقاله پیشنهادی:', e2)
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

    // 3) اگر previousArticleLink باشد (شامل /articles/)، آن را به عنوان مقاله قبلی واکشی کن
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
            console.warn('مقاله پیشنهادی یافت نشد یا منتشر نشده است')
            setSelectedDraft(null)
          }
        } catch (e) {
          console.error('خطا در دریافت مقاله پیشنهادی:', e)
          setSelectedDraft(null)
        } finally {
          setShowArticleComparison(true)
        }
      })()
    } else {
      setShowArticleComparison(true)
    }
  }, [extractSlug, parsedArticlesData?.drafts, fetchOriginalArticle, handleDraftSelect])

  // ارتقای آمار مقالات بر اساس drafts برای شمارش ویرایش‌ها
  const handleStatsFromDiagram = React.useCallback((incomingStats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => {
    if (!onStatsChange) return

    // 1) جمع‌آوری ویرایش‌های مقاله از روی drafts (وجود originalArticleSlug)
    const editedDraftSlugs = new Set<string>()
    if (parsedArticlesData?.drafts && Array.isArray(parsedArticlesData.drafts)) {
      parsedArticlesData.drafts.forEach((d) => {
        const slug = (d.originalArticleSlug || '').trim()
        if (slug) editedDraftSlugs.add(slug)
      })
    }

    // 2) محاسبه تغییر لینک مقاله روی نودها و استخراج slug برای جلوگیری از شمارش دوباره
    const getSlugFromNodeData = (data: any): string => {
      try {
        const d = data || {}
        const draft = d.articleDraft || {}
        if (typeof draft?.slug === 'string' && draft.slug.trim()) return draft.slug.trim()
        if (typeof draft?.id === 'string' && draft.id.trim()) return draft.id.trim()
        if (typeof d.articleLink === 'string' && d.articleLink.trim()) return extractSlug(d.articleLink.trim()) || ''
        // توجه: دیگر previousArticleLink را به‌عنوان fallback لحاظ نمی‌کنیم تا آمار وضعیت فعلی را منعکس کند
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
        // تغییر اتصال مقاله برای این نود
        editedByLinkSlugs.add(o)
      }
    })

    // 3) اتحاد دو مجموعه برای به‌دست آوردن آمار نهایی «ویرایش مقالات»
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
      {/* مقایسه نمودارها */}
      <DiagramComparison
        originalData={originalData}
        proposedData={proposedData}
        onShowArticleComparison={handleShowArticleComparison}
        onStatsChange={handleStatsFromDiagram}
      />

      {/* لیست پیش‌نویس‌ها (فقط در صورت وجود داده‌ها) */}
      {parsedArticlesData && parsedArticlesData.drafts && parsedArticlesData.drafts.length > 0 && (
        <div className="mt-8">
          <h4 className="font-bold text-lg text-dark-text mb-4">مقالات پیشنهادی</h4>
          <div className="grid gap-4 mb-6">
            {parsedArticlesData.drafts.map((draft) => (
              <div key={draft.id} className="card border border-gray-600">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h5 className="font-semibold text-dark-text">{draft.title}</h5>
                    <p className="text-sm text-dark-muted mt-1">
                      Slug: {draft.slug}
                    </p>
                    {draft.description && (
                      <p className="text-sm text-dark-muted mt-1">
                        {draft.description}
                      </p>
                    )}
                    {draft.originalArticleSlug && (
                      <p className="text-xs text-blue-400 mt-1">
                        ویرایش مقاله: {draft.originalArticleSlug}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDraftSelect(draft)}
                    className="btn-primary text-sm"
                  >
                    مقایسه
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* مودال مقایسه مقاله */}
      {showArticleComparison && (
        <EmbeddedArticleViewer
          originalArticleLink={selectedDraft?.originalArticleSlug}
          proposedArticleLink={selectedDraft?.slug || selectedDraft?.id}
          articlesData={articlesData}
          postContent={JSON.stringify(proposedData)}
          onClose={() => setShowArticleComparison(false)}
        />
      )}
    </div>
  )
}