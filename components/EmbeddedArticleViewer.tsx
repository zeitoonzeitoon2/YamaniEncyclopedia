"use client";

import React from 'react'

// Internal Article Viewer Component for displaying draft articles inline
export default function EmbeddedArticleViewer({ 
  originalArticleLink, 
  proposedArticleLink, 
  articlesData,
  postContent,
  onClose 
}: {
  originalArticleLink?: string
  proposedArticleLink?: string
  articlesData?: string
  postContent?: string
  onClose: () => void
}) {
  const [originalContent, setOriginalContent] = React.useState<string>('در حال بارگذاری...')
  const [proposedContent, setProposedContent] = React.useState<string>('در حال بارگذاری...')
  const [originalError, setOriginalError] = React.useState<string>('')
  const [proposedError, setProposedError] = React.useState<string>('')

  // Helper: normalize slug from any kind of article link (handles trailing slashes and full URLs)
  const normalizeSlugFromLink = (link: string): string => {
    try {
      let path = link || ''
      
      // If it's already a draft ID (starts with 'cmeb' or similar pattern), return as is
      if (/^[a-z0-9]{20,}$/i.test(path.trim())) {
        return path.trim()
      }
      
      if (/^https?:\/\//i.test(link)) {
        const u = new URL(link)
        path = u.pathname
      }
      // strip query/hash
      path = path.split('?')[0].split('#')[0]
      // remove leading /articles/
      const after = path.replace(/^\/?articles\//, '')
      // trim trailing slashes
      return decodeURIComponent(after.replace(/\/+$/g, ''))
    } catch {
      const cleaned = (link || '').replace(/^\/?articles\//, '').replace(/\/+$/g, '')
      // If it's a draft ID, return as is
      if (/^[a-z0-9]{20,}$/i.test(cleaned)) {
        return cleaned
      }
      return cleaned
    }
  }

  // Helper function to find draft content by link or slug
  const findDraftContent = async (link: string): Promise<string | null> => {
    const targetSlug = normalizeSlugFromLink(link)
    console.log('findDraftContent called with link:', link, 'normalized to:', targetSlug)
    
    // Check if the link looks like a draft ID (starts with 'cmeb' or similar pattern)
    if (/^[a-z0-9]{20,}$/i.test(targetSlug)) {
      console.log('Detected draft ID, fetching from API:', targetSlug)
      try {
        const response = await fetch(`/api/drafts/${targetSlug}`)
        console.log('Draft API response status:', response.status)
        if (response.ok) {
          const draft = await response.json()
          console.log('Draft fetched successfully:', draft)
          return draft.content || null
        } else {
          console.log('Draft API error:', await response.text())
        }
      } catch (e) {
        console.error('Error fetching draft by ID:', e)
      }
    } else {
      console.log('Not a draft ID, continuing with normal flow')
    }
    
    // First, try to find in articlesData
    if (articlesData) {
      try {
        const data = JSON.parse(articlesData)
        if (data.type === 'drafts' && data.drafts) {
          const draft = data.drafts.find((d: any) => d.slug === targetSlug)
          if (draft) return draft.content
        }
      } catch (e) {
        console.error('Error parsing articlesData:', e)
      }
    }
    
    // Second, try to find in post content's articleDraft
    if (postContent) {
      try {
        const treeData = JSON.parse(postContent)
        if (treeData.nodes) {
          for (const node of treeData.nodes) {
            if (node.data?.articleDraft && node.data.articleDraft.slug === targetSlug) {
              return node.data.articleDraft.content
            }
          }
        }
      } catch (e) {
        console.error('Error parsing postContent:', e)
      }
    }
    
    return null
  }

  // Load original article content
  React.useEffect(() => {
    if (originalArticleLink) {
      const slug = normalizeSlugFromLink(originalArticleLink)
      if (slug) {
        // همیشه محتوای نسخه منتشرشده را از API بارگذاری کن؛ نسخه پیشنهادی از drafts خوانده می‌شود
        fetch(`/api/articles/${slug}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              setOriginalError('مقاله یافت نشد')
              setOriginalContent('')
            } else {
              setOriginalContent(data.content || 'محتوایی موجود نیست')
              setOriginalError('')
            }
          })
          .catch(() => {
            setOriginalError('خطا در بارگذاری مقاله')
            setOriginalContent('')
          })
      } else {
        setOriginalContent('مقاله‌ای متصل نشده')
        setOriginalError('')
      }
    } else {
      setOriginalContent('مقاله‌ای متصل نشده')
      setOriginalError('')
    }
  }, [originalArticleLink])

  // Load proposed article content
  React.useEffect(() => {
    const loadProposedContent = async () => {
      if (proposedArticleLink) {
        // First try to find in drafts/articlesData
        const draftContent = await findDraftContent(proposedArticleLink)
        if (draftContent) {
          setProposedContent(draftContent)
          setProposedError('')
          return
        }
        
        // Fall back to API
        const slug = normalizeSlugFromLink(proposedArticleLink)
        if (slug) {
          try {
            const res = await fetch(`/api/articles/${slug}`)
            const data = await res.json()
            if (data.error) {
              setProposedError('مقاله یافت نشد')
              setProposedContent('')
            } else {
              setProposedContent(data.content || 'محتوایی موجود نیست')
              setProposedError('')
            }
          } catch {
            setProposedError('خطا در بارگذاری مقاله')
            setProposedContent('')
          }
        } else {
          setProposedContent('مقاله‌ای متصل نشده')
          setProposedError('')
        }
      } else {
        setProposedContent('مقاله‌ای متصل نشده')
        setProposedError('')
      }
    }
    
    loadProposedContent()
  }, [proposedArticleLink, articlesData])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-card border border-dark-border rounded-xl w-[95vw] max-w-[1600px] max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h3 className="text-xl font-bold text-dark-text">مقایسه مقاله</h3>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            بستن
          </button>
        </div>
        
        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 max-h-[calc(95vh-80px)] overflow-y-auto">
          {/* Original Article (RIGHT in RTL) */}
          <div className="bg-stone-800 border border-amber-700/40 rounded-lg p-4">
            <h4 className="text-amber-100 font-semibold mb-4">
              مقاله فعلی
              {originalArticleLink && (
                <span className="text-sm font-normal block text-amber-200 break-all">
                  {originalArticleLink}
                </span>
              )}
            </h4>
            <div className="text-amber-50 whitespace-pre-wrap break-words text-sm max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md bg-stone-900/40 p-3">
              {originalError ? (
                <div className="text-red-400">{originalError}</div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none break-words"
                     dangerouslySetInnerHTML={{ __html: originalContent }} />
              )}
            </div>
          </div>
          
          {/* Proposed Article (LEFT in RTL) */}
          <div className="bg-stone-800 border border-amber-700/40 rounded-lg p-4">
            <h4 className="text-amber-100 font-semibold mb-4">
              مقاله پیشنهادی
              {proposedArticleLink && (
                <span className="text-sm font-normal block text-amber-200 break-all">
                  {proposedArticleLink}
                </span>
              )}
            </h4>
            <div className="text-amber-50 whitespace-pre-wrap break-words text-sm max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md bg-stone-900/40 p-3">
              {proposedError ? (
                <div className="text-red-400">{proposedError}</div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none break-words"
                     dangerouslySetInnerHTML={{ __html: proposedContent }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}