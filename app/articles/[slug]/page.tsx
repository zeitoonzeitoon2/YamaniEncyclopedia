'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'
import { applyArticleTransforms } from '@/lib/footnotes'

interface Article {
  id?: string
  title: string
  slug: string
  content: string
  description?: string | null
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
            {/* محتوای مقاله با پاورقی */}
            <div
              className="text-dark-text whitespace-pre-wrap leading-7 prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: applyArticleTransforms(article.content) }}
            />
          </article>
        ) : null}

        {/* دکمه بازگشت حذف شد */}
        

      </main>
    </div>
  )
}