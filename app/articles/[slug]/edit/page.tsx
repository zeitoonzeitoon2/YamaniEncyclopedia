'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Header } from '@/components/Header'
import { Modal } from '@/components/Modal'
import toast from 'react-hot-toast'

export default function EditArticlePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams() as { slug?: string }
  const slug = params?.slug || ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newArticleUrl, setNewArticleUrl] = useState('')
  const [newArticlePath, setNewArticlePath] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    content: ''
  })

  useEffect(() => {
    const loadArticle = async () => {
      try {
        const res = await fetch(`/api/articles/${slug}`)
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        setFormData({
          title: data.title || '',
          slug: data.slug || '',
          description: data.description || '',
          content: data.content || ''
        })
      } catch (e) {
        toast.error('خطا در بارگذاری مقاله')
      } finally {
        setLoading(false)
      }
    }

    if (slug) loadArticle()
  }, [slug])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!session) {
      toast.error('لطفاً وارد شوید')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/articles/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          description: formData.description
        })
      })
      if (res.ok) {
        const result = await res.json()
        toast.success(result.message || 'مقاله جدید ایجاد شد', {
          duration: 2500,
          style: {
            background: '#10b981',
            color: 'white',
            fontSize: '14px'
          }
        })
        // به جای ریدایرکت مستقیم، مودال نمایش لینک مقاله جدید را باز کن
        const path = result.newUrl || (result.article?.slug ? `/articles/${result.article.slug}` : '')
        const absolute = path ? `${window.location.origin}${path}` : ''
        setNewArticlePath(path)
        setNewArticleUrl(absolute)
        setShowModal(true)
      } else {
        const err = await res.json()
        toast.error(err.error || 'خطا در ایجاد نسخه جدید مقاله')
      }
    } catch (e) {
      console.error(e)
      toast.error('خطا در ایجاد نسخه جدید مقاله')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading) {
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
            <h1 className="text-3xl font-bold text-dark-text">ویرایش مقاله</h1>
            <button onClick={() => router.back()} className="btn-secondary">بازگشت</button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="card">
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">عنوان</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">Slug</label>
                <div className="flex items-center">
                  <span className="px-3 py-3 bg-gray-700 text-gray-300 rounded-r-lg border border-r border-gray-600">/articles/</span>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    className="flex-1 p-3 rounded-l-lg border-l border-t border-b border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                    required
                  />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">خلاصه</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={3}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-text mb-2">محتوا</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-secondary text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={15}
                  required
                />
              </div>

              <div className="flex items-center gap-4">
                <button type="submit" disabled={saving} className="btn-primary max-w-xs">
                  {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                </button>
                <button type="button" onClick={() => router.push(`/articles/${slug}`)} className="btn-secondary">
                  انصراف
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
      
      {/* مودال نمایش لینک مقاله جدید */}
      <Modal 
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="مقاله جدید ساخته شد!"
      >
        <div className="space-y-4">
          <p className="text-gray-700">لینک مقاله جدید آماده است. می‌توانید آن را کپی کنید یا به صفحه مقاله بروید.</p>
          <div className="bg-gray-50 p-3 rounded-lg border">
            <label className="block text-sm font-medium text-gray-700 mb-2">لینک مقاله جدید:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newArticleUrl}
                readOnly
                className="flex-1 p-2 border border-gray-300 rounded text-sm font-mono bg-white"
                onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
              />
              <button
                onClick={() => {
                  if (newArticleUrl) {
                    navigator.clipboard.writeText(newArticleUrl)
                    toast.success('لینک کپی شد!', { duration: 1800 })
                  }
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
              >
                کپی
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              بستن
            </button>
            <button
              onClick={() => {
                if (newArticlePath) router.push(newArticlePath)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              رفتن به مقاله
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}