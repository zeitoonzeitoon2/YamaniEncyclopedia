'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'

interface QuickArticleModalProps {
  isOpen: boolean
  onClose: () => void
  onArticleCreated: (articleSlug: string) => void
  // اگر این مود فعال باشد، به جای ایجاد مقاله واقعی، خروجی پیش‌نویس را برمی‌گردانیم
  createViaAPI?: boolean
  onDraftCreated?: (draft: { title: string; description?: string; content: string; slug: string }) => void
  // برای ویرایش مقاله پیش‌نویس
  editMode?: boolean
  existingDraft?: { title: string; description?: string; content: string; slug: string }
}

export default function QuickArticleModal({ 
  isOpen, 
  onClose, 
  onArticleCreated, 
  createViaAPI = true, 
  onDraftCreated,
  editMode = false,
  existingDraft
}: QuickArticleModalProps) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: ''
  })

  // بارگذاری داده‌های مقاله موجود در حالت ویرایش
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

  // قفل اسکرول صفحه هنگام باز بودن مودال
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // تولید نمایشی slug از عنوان (فقط برای نمایش به کاربر) و همچنین استفاده در مود پیش‌نویس
  const previewSlug = (title: string) => {
    const normalized = (title || '')
      .toLowerCase()
      .trim()
      // نرمال‌سازی کاراکترهای عربی به فارسی
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      // حذف نیم‌فاصله و کنترل‌های bidi
      .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
    const slug = normalized
      .replace(/\s+/g, '-')
      .replace(/[^\w\-\u0600-\u06FF]/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+|-+$/g, '')
    return slug || 'article'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!session) {
      toast.error('لطفاً وارد شوید')
      return
    }

    if (!formData.title || !formData.content) {
      toast.error('عنوان و محتوا الزامی هستند')
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
          toast.success(editMode ? 'مقاله با موفقیت ویرایش شد' : 'مقاله با موفقیت ایجاد شد')
          if (editMode) {
            const slug = result?.newSlug || result?.article?.slug || existingDraft?.slug
            if (slug) onArticleCreated(slug)
          } else {
            // API returns full article object, so we need to access the slug property
            onArticleCreated(result.slug || result.article?.slug)
          }
          setFormData({ title: '', description: '', content: '' })
          onClose()
        } else {
          const error = await response.json()
          toast.error(error.error || (editMode ? 'خطا در ویرایش مقاله' : 'خطا در ایجاد مقاله'))
        }
      } else {
        // مود پیش‌نویس: مقاله را ایجاد نکن، فقط داده را به والد برگردان
        // برای ویرایش‌ها، همان slug اصلی را نگه می‌داریم تا پس از تایید، همان مقاله به‌روزرسانی شود
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
        toast.success(editMode ? 'پیش‌نویس مقاله ویرایش شد' : 'پیش‌نویس مقاله ایجاد و به فلش‌کارت متصل شد')
        setFormData({ title: '', description: '', content: '' })
        onClose()
      }
    } catch (error) {
      console.error('Error creating/editing article:', error)
      toast.error(editMode ? 'خطا در ویرایش مقاله' : 'خطا در ایجاد مقاله')
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
            {editMode ? 'ویرایش مقاله' : 'ایجاد مقاله سریع'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            aria-label="بستن"
            title="بستن"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* عنوان مقاله */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                عنوان مقاله *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                placeholder="عنوان مقاله را وارد کنید..."
                required
                autoFocus
              />
              {formData.title && (
                <p className="text-xs text-gray-400 mt-1 break-words">
                  آدرس URL (خودکار): /articles/{previewSlug(formData.title)}
                </p>
              )}
            </div>

            {/* خلاصه مقاله */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                خلاصه مقاله
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                rows={2}
                placeholder="خلاصه کوتاهی از مقاله..."
              />
            </div>

            {/* محتوای مقاله */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                محتوای مقاله *
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary whitespace-pre-wrap break-words"
                rows={10}
                placeholder="محتوای مقاله را اینجا بنویسید..."
                required
              />
            </div>

            {/* دکمه‌های عمل */}
            <div className="flex items-center gap-4 pt-4">
              <button
                type="submit"
                disabled={loading || !formData.title || !formData.content}
                className="btn-primary flex-1"
              >
                {loading 
                  ? (editMode ? 'در حال ویرایش...' : 'در حال ایجاد...') 
                  : editMode 
                    ? 'ذخیره تغییرات'
                    : (createViaAPI ? 'ایجاد و اتصال به فلش‌کارت' : 'ایجاد پیش‌نویس و اتصال')
                }
              </button>
              
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
              >
                بستن
              </button>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/40">
            <p className="text-xs text-blue-300 break-words">
              💡 آدرس URL (slug) به‌صورت خودکار توسط سیستم از عنوان تولید می‌شود و مقاله بلافاصله به فلش‌کارت متصل خواهد شد.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}