'use client'

import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import toast from 'react-hot-toast'

export default function NewArticlePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    content: ''
  })

  const contentRef = useRef<HTMLTextAreaElement | null>(null)

  const getNextFootnoteNumber = (text: string) => {
    let maxNum = 0
    const refRe = /\[\^(\d+)\]/g
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
    setTimeout(() => {
      const pos = before.length + refText.length
      ta?.focus()
      ta?.setSelectionRange(pos, pos)
    }, 0)
  }

  const insertAtCursor = (text: string) => {
    const ta = contentRef.current
    const current = formData.content || ''
    if (!ta) {
      setFormData(prev => ({ ...prev, content: current + text }))
      return
    }
    const start = ta.selectionStart ?? current.length
    const end = ta.selectionEnd ?? start
    const before = current.slice(0, start)
    const after = current.slice(end)
    const updated = before + text + after
    setFormData(prev => ({ ...prev, content: updated }))
    setTimeout(() => {
      const pos = before.length + text.length
      ta?.focus()
      ta?.setSelectionRange(pos, pos)
    }, 0)
  }

  // تولید خودکار slug از عنوان
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')  // جایگزینی فاصله با خط تیره
      .replace(/[^\w\-آ-ی]/g, '')  // حذف کاراکترهای غیرمجاز
      .replace(/\-\-+/g, '-')  // حذف خط تیره‌های متوالی
      .replace(/^-+|-+$/g, '')  // حذف خط تیره از ابتدا و انتها
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!session) {
      toast.error('لطفاً وارد شوید')
      return
    }

    if (!formData.title || !formData.content || !formData.slug) {
      toast.error('عنوان، آدرس URL و محتوا الزامی هستند')
      return
    }

    setLoading(true)
    
    try {
      const response = await fetch('/api/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        const article = await response.json()
        toast.success('مقاله با موفقیت ایجاد شد')
        router.push(`/articles/${article.slug}`)
      } else {
        const error = await response.json()
        toast.error(error.error || 'خطا در ایجاد مقاله')
      }
    } catch (error) {
      console.error('Error creating article:', error)
      toast.error('خطا در ایجاد مقاله')
    } finally {
      setLoading(false)
    }
  }

  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      // اگر slug خالی است یا با عنوان قبلی تولید شده، آن را به‌روزرسانی کن
      slug: prev.slug === '' || prev.slug === generateSlug(prev.title) 
        ? generateSlug(title) 
        : prev.slug
    }))
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">در حال بارگذاری...</div>
      </div>
    )
  }

  if (!session) {
    router.push('/auth/signin')
    return null
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-dark-text">ایجاد مقاله جدید</h1>
            <button
              onClick={() => router.back()}
              className="btn-secondary"
            >
              بازگشت
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="card">
              {/* عنوان مقاله */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">
                  عنوان مقاله *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  placeholder="عنوان مقاله را وارد کنید..."
                  required
                />
              </div>

              {/* آدرس URL */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">
                  آدرس URL (Slug) *
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-3 bg-gray-700 text-gray-300 rounded-r-lg border border-r border-gray-600">
                    /articles/
                  </span>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    className="flex-1 p-3 rounded-l-lg border-l border-t border-b border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                    placeholder="آدرس-url-مقاله"
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  آدرس URL باید منحصر به فرد باشد و فقط شامل حروف، اعداد و خط تیره باشد
                </p>
              </div>

              {/* خلاصه مقاله */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">
                  خلاصه مقاله
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={3}
                  placeholder="خلاصه کوتاهی از مقاله..."
                />
              </div>

              {/* محتوای مقاله */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">
                  محتوای مقاله *
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={insertFootnoteAtCursor}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="افزودن پاورقی"
                  >
                    + پاورقی
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n## ')}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="افزودن عنوان H2"
                  >
                    + H2
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n### ')}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="افزودن عنوان H3"
                  >
                    + H3
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n#### ')}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="افزودن عنوان H4"
                  >
                    + H4
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n> !ayah ')}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="نقل آیه"
                  >
                    + آیه
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n> !quote: ')}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50"
                    title="نقل قول"
                  >
                    + قول
                  </button>
                </div>
                <textarea
                  ref={contentRef}
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={15}
                  placeholder="محتوای کامل مقاله را اینجا بنویسید..."
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  می‌توانید از Markdown یا HTML استفاده کنید
                </p>
              </div>

              {/* دکمه‌های عمل */}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex-1 max-w-xs"
                >
                  {loading ? 'در حال ایجاد...' : 'ایجاد مقاله'}
                </button>
                
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="btn-secondary"
                >
                  انصراف
                </button>
              </div>
            </div>
          </form>

          {/* پیش‌نمایش URL */}
          {formData.slug && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>پیش‌نمایش آدرس:</strong> {window.location.origin}/articles/{formData.slug}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}