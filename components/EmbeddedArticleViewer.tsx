"use client";

import React from 'react'
import { applyArticleTransforms } from '@/lib/footnotes'

// مكوّن عارض المقالات الداخلي لعرض مسودّات المقالات ضمنيًا
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
  const [originalContent, setOriginalContent] = React.useState<string>('جارٍ التحميل...')
  const [proposedContent, setProposedContent] = React.useState<string>('جارٍ التحميل...')
  const [originalError, setOriginalError] = React.useState<string>('')
  const [proposedError, setProposedError] = React.useState<string>('')

  // مكوّن عارض المقالات الداخلي لعرض المسودّات ضمنيًا
  const normalizeSlugFromLink = (link: string): string => {
    try {
      let path = link || ''
      
      // إذا كان أصلًا معرّف مسوّدة (يبدأ بنمط مثل cmeb...) فأعده كما هو
      if (/^[a-z0-9]{20,}$/i.test(path.trim())) {
        return path.trim()
      }
      
      if (/^https?:\/\//i.test(link)) {
        const u = new URL(link)
        path = u.pathname
      }
      // إزالة الاستعلام وعلامة التجزئة
      path = path.split('?')[0].split('#')[0]
      // إزالة البادئة /articles/
      const after = path.replace(/^\/?articles\//, '')
      // تشذيب الشرطات المائلة النهائية
      return decodeURIComponent(after.replace(/\/+$/g, ''))
    } catch {
      const cleaned = (link || '').replace(/^\/?articles\//, '').replace(/\/+$/g, '')
      // إذا كان معرّف مسوّدة فأعده كما هو
      if (/^[a-z0-9]{20,}$/i.test(cleaned)) {
        return cleaned
      }
      return cleaned
    }
  }

  // دالة مساعدة للعثور على محتوى المسودّة عبر الرابط أو المعرّف (slug)
  const findDraftContent = async (link: string): Promise<string | null> => {
    const targetSlug = normalizeSlugFromLink(link)
    console.log('findDraftContent called with link:', link, 'normalized to:', targetSlug)
    
    // تحقّق مما إذا كان الرابط يبدو معرّف مسوّدة (يبدأ بنمط مثل 'cmeb' أو ما شابهه)
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
    
    // أولًا، حاول العثور عليه في articlesData
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
    
    // ثانيًا، حاول البحث في articleDraft داخل محتوى المنشور
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

  // تحميل محتوى المقال الأصلي
  React.useEffect(() => {
    if (originalArticleLink) {
      const slug = normalizeSlugFromLink(originalArticleLink)
      if (slug) {
        // حمّل دائماً محتوى النسخة المنشورة من واجهة البرمجة (API)؛ أما النسخة المقترحة فتُقرأ من drafts
        fetch(`/api/articles/${slug}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              setOriginalError('المقال غير موجود')
              setOriginalContent('')
            } else {
              setOriginalContent(applyArticleTransforms(data.content || 'لا يوجد محتوى'))
              setOriginalError('')
            }
          })
          .catch(() => {
            setOriginalError('خطأ في تحميل المقال')
            setOriginalContent('')
          })
      } else {
        setOriginalContent('لا يوجد مقال متصل')
        setOriginalError('')
      }
    } else {
      setOriginalContent('لا يوجد مقال متصل')
      setOriginalError('')
    }
  }, [originalArticleLink])

  // تحميل محتوى المقال المقترح
  React.useEffect(() => {
    const loadProposedContent = async () => {
      if (proposedArticleLink) {
        // جرّب أولًا البحث في المسودّات/‏articlesData
        const draftContent = await findDraftContent(proposedArticleLink)
        if (draftContent) {
          setProposedContent(applyArticleTransforms(draftContent))
          setProposedError('')
          return
        }
        
        // الرجوع إلى واجهة البرمجة (API) في حال عدم العثور
        const slug = normalizeSlugFromLink(proposedArticleLink)
        if (slug) {
          try {
            const res = await fetch(`/api/articles/${slug}`)
            const data = await res.json()
            if (data.error) {
              setProposedError('المقال غير موجود')
              setProposedContent('')
            } else {
              setProposedContent(applyArticleTransforms(data.content || 'لا يوجد محتوى'))
              setProposedError('')
            }
          } catch {
            setProposedError('خطأ في تحميل المقال')
            setProposedContent('')
          }
        } else {
          setProposedContent('لا يوجد مقال متصل')
          setProposedError('')
        }
      } else {
        setProposedContent('لا يوجد مقال متصل')
        setProposedError('')
      }
    }
    
    loadProposedContent()
  }, [proposedArticleLink, articlesData])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-card border border-dark-border rounded-xl w-[95vw] max-w-[1600px] max-h-[95vh] overflow-hidden shadow-2xl">
        {/* الترويسة */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h3 className="text-xl font-bold text-dark-text">مقارنة المقال</h3>
          <button onClick={onClose} className="px-3 py-1 rounded bg-dark-muted text-dark-text hover:bg-dark-border">إغلاق</button>
        </div>
        
        {/* المحتوى */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 max-h-[calc(95vh-80px)] overflow-y-auto">
          {/* المقال الحالي (يمين في وضع RTL) */}
          <div className="bg-stone-800 border border-amber-700/40 rounded-lg p-4">
            <h4 className="text-amber-100 font-semibold mb-4">
              المقال الحالي
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
          
          {/* المقال المقترح (يسار في وضع RTL) */}
          <div className="bg-stone-800 border border-amber-700/40 rounded-lg p-4">
            <h4 className="text-amber-100 font-semibold mb-4">
              المقال المقترح
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