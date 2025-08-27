'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { applyFootnotes } from '@/lib/footnotes'

interface QuickArticleModalProps {
  isOpen: boolean
  onClose: () => void
  onArticleCreated: (articleSlug: string) => void
  // إذا كان هذا الوضع مفعلاً، فسنُرجِع مسودة بدل إنشاء مقال فعلي
  createViaAPI?: boolean
  onDraftCreated?: (draft: { title: string; description?: string; content: string; slug: string }) => void
  // لتحرير مقالة مسودة
  editMode?: boolean
  existingDraft?: { title: string; description?: string; content: string; slug: string }
}

export default function QuickArticleModal({
  isOpen,
  onClose,
  onArticleCreated,
  createViaAPI,
  onDraftCreated,
  editMode,
  existingDraft,
}: QuickArticleModalProps) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: ''
  })

  // ——— جدید: ref و توابع درج پاورقی ———
  const contentRef = useRef<HTMLTextAreaElement | null>(null)

  const getNextFootnoteNumber = (text: string) => {
    let maxNum = 0
    // ارجاعات
    const refRe = /\[\^(\d+)\]/g
    // تعاریف
    const defRe = /^\[\^(\d+)\]:/gm
    let m: RegExpExecArray | null

    while ((m = refRe.exec(text)) !== null) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > maxNum) maxNum = n
    }
    while ((m = defRe.exec(text)) !== null) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > maxNum) maxNum = n
    }
    return maxNum + 1
  }

  const insertFootnoteAtCursor = () => {
    const ta = contentRef.current
    const current = formData.content || ''
    const nextNum = getNextFootnoteNumber(current)
    const refText = `[^${nextNum}]`
    const defText = `\n\n[^${nextNum}]: `

    if (!ta) {
      // اگر ref هنوز set نشده بود، به انتها اضافه کن
      const updated = current + refText + (current.includes(`[^${nextNum}]:`) ? '' : defText)
      setFormData(prev => ({ ...prev, content: updated }))
      return
    }

    const start = ta.selectionStart ?? current.length
    const end = ta.selectionEnd ?? start
    const before = current.slice(0, start)
    const after = current.slice(end)

    let updated = before + refText + after
    if (!updated.includes(`[^${nextNum}]:`)) {
      updated += defText
    }

    setFormData(prev => ({ ...prev, content: updated }))

    // تنظیم مکان‌نما بلافاصله بعد از ارجاع
    setTimeout(() => {
      const pos = before.length + refText.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  // تحميل بيانات المقالة الموجودة في وضع التحرير
  useEffect(() => {
    if (editMode && existingDraft) {
      setFormData({
        title: existingDraft.title || '',
        description: existingDraft.description || '',
        content: existingDraft.content || ''
      })
    } else if (!editMode) {
      setFormData({ title: '', description: '', content: '' })
    }
  }, [editMode, existingDraft, isOpen])

  // قفل تمرير الصفحة أثناء فتح النافذة
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // توليد slug تمهيدي من العنوان (للعرض على المستخدم) ويُستخدم أيضاً في وضع المسودة
  const previewSlug = (title: string) => {
    const normalized = (title || '')
      .toLowerCase()
      .trim()
      // تطبيع الحروف الفارسية إلى العربية
      .replace(/[ی]/g, 'ي')
      .replace(/[ک]/g, 'ك')
      // حذف المسافة الضيقة وعلامات التحكم بالاتجاه (bidi)
      .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
    const slug = normalized
      .replace(/\s+/g, '-')
      // إزالة أي محارف غير مسموح بها باستثناء العربية والشرطة
      .replace(/[^\w\-\u0600-\u06FF]/g, '')
      // توحيد الشرطات المتتالية إلى شرطة واحدة
      .replace(/\-\-+/g, '-')
      // إزالة الشرطات الزائدة من البداية والنهاية
      .replace(/^-+|-+$/g, '')
    return slug || 'article'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!session) {
      toast.error('يرجى تسجيل الدخول')
      return
    }

    if (!formData.title || !formData.content) {
      toast.error('العنوان والمحتوى مطلوبان')
      return
    }

    setLoading(true)
    
    try {
      if (createViaAPI) {
        const url = editMode && existingDraft ? `/api/articles/${existingDraft.slug}` : '/api/articles'
        const method = editMode && existingDraft ? 'PATCH' : 'POST'
        
        const bodyData = editMode && existingDraft 
          ? {
              title: formData.title,
              description: formData.description,
              content: formData.content,
              slug: existingDraft.slug // حفظ slug موجود
            }
          : {
              title: formData.title,
              description: formData.description,
              content: formData.content,
            }

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyData),
        })
  
        if (response.ok) {
          const result = await response.json()
          toast.success(editMode ? 'تم تحرير مسودة المقال' : 'تم إنشاء مسودة المقال وربطها ببطاقة البيانات')
          if (editMode) {
            const slug = result?.newSlug || result?.article?.slug || existingDraft?.slug
            if (slug) onArticleCreated(slug)
          } else {
            // تُرجِع واجهة البرمجة API كائن المقال الكامل، لذا نحتاج للوصول إلى خاصية slug
            onArticleCreated(result.slug || result.article?.slug)
          }
          setFormData({ title: '', description: '', content: '' })
          onClose()
        } else {
          const error = await response.json()
          toast.error(editMode ? 'خطأ في تحرير المقال' : 'خطأ في إنشاء المقال')
        }
      } else {
        // وضع المسودة: لا تُنشئ المقالة، فقط أعد البيانات إلى المكوّن الأب
        // للتعديلات، أبقِ على نفس المعرّف (slug) الأصلي لكي يتم تحديث نفس المقال بعد الموافقة
        const slug = editMode && existingDraft 
          ? existingDraft.slug 
          : (previewSlug(formData.title) || 'article')
        const draftData = {
          title: formData.title,
          description: formData.description,
          content: formData.content,
          slug,
        }
        onDraftCreated?.(draftData)
        onArticleCreated(slug)
        toast.success(editMode ? 'تم تحرير مسودة المقال' : 'تم إنشاء مسودة المقال وربطها ببطاقة البيانات')
        setFormData({ title: '', description: '', content: '' })
        onClose()
      }
    } catch (error) {
      console.error('Error creating/editing article:', error)
      toast.error(editMode ? 'خطأ في تحرير المقال' : 'خطأ في إنشاء المقال')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({ title: '', description: '', content: '' })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-secondary rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
          <h2 className="text-xl font-bold text-dark-text">
            {editMode ? 'تعديل المقال' : 'إنشاء مقالة سريعة'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            aria-label="إغلاق"
            title="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* عنوان المقال */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                عنوان المقال *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                placeholder="أدخل عنوان المقال..."
                required
                autoFocus
              />
              {formData.title && (
                <p className="text-xs text-gray-400 mt-1 break-words">
                  عنوان URL (تلقائي): /articles/{previewSlug(formData.title)}
                </p>
              )}
            </div>

            {/* ملخّص المقال */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                ملخص المقال
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                rows={2}
                placeholder="ملخص قصير للمقال..."
              />
            </div>

            {/* محتوى المقال */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-text">
                  محتوى المقال *
                </label>
                <button
                  type="button"
                  onClick={insertFootnoteAtCursor}
                  className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                  title="أضف حاشية في موضع المؤشر"
                >
                  + حاشية
                </button>
              </div>
              <textarea
                ref={contentRef}
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary whitespace-pre-wrap break-words"
                rows={10}
                placeholder="اكتب محتوى المقال هنا... مثال: هذا نص فيه حاشية[^1]\n\n[^1]: اكتب نص الحاشية هنا."
                required
              />
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex items-center gap-4 pt-4">
              <button
                type="submit"
                disabled={loading || !formData.title || !formData.content}
                className="btn-primary flex-1"
              >
                {loading 
                  ? (editMode ? 'جارٍ التحرير...' : 'جارٍ الإنشاء...') 
                  : editMode 
                    ? 'حفظ التغييرات'
                    : (createViaAPI ? 'إنشاء وربط ببطاقة البيانات' : 'إنشاء مسودة وربط')
                }
              </button>
              
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
              >
                إغلاق
              </button>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/40">
            <p className="text-xs text-blue-300 break-words">
              💡 سيتم إنشاء عنوان URL (الاسم المميز) تلقائيًا من العنوان، وسيتم ربط المقال فورًا ببطاقة البيانات.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}