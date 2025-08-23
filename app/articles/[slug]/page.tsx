'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'

interface Article {
  id: string
  title: string
  content: string
  slug: string
  description?: string
  createdAt: string
  author: {
    id: string
    name: string | null
    image: string | null
  }
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  // const { data: session } = useSession()
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const res = await fetch(`/api/articles/${params.slug}`)
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.message || 'مقاله یافت نشد')
        }
        const data = await res.json()
        setArticle(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'مقاله یافت نشد')
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [params.slug])

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-dark-text">در حال بارگذاری...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : article ? (
          <article className="prose prose-invert max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-dark-text mb-4">{article.title}</h1>
            {article.description && (
              <p className="text-gray-400 mb-6">{article.description}</p>
            )}
            {/* محتوای مقاله - به صورت ساده HTML/Markdown فرض شده */}
            <div className="text-dark-text whitespace-pre-wrap leading-7">
              {article.content}
            </div>
          </article>
        ) : null}

        <div className="mt-8 flex gap-4">
          <button
            onClick={() => router.back()}
            className="btn-secondary"
          >
            بازگشت
          </button>
          {/* دکمه ویرایش مقاله حذف شد چون ویرایش از طریق مودال در صفحه create انجام می‌شود */}
        </div>
        

      </main>
    </div>
  )
}