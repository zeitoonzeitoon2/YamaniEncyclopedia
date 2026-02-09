'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/navigation'
// import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'
// حذف رندر ری‌اکتی دکمه‌ها؛ از هندلرهای سراسری استفاده می‌کنیم
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
  const [fontScale, setFontScale] = useState(1)
  const [html, setHtml] = useState('')

  useEffect(() => {
    const clamp = (n: number) => Math.max(0.8, Math.min(1.6, n))
    const setScale = (val: number) => {
      const v = clamp(parseFloat(val.toFixed(2)))
      setFontScale(v)
      const body = document.getElementById('article-content-body')
      if (body) body.style.setProperty('--article-scale', String(v))
    }
    ;(window as any).__articleResize = {
      inc: () => setScale(fontScale + 0.1),
      dec: () => setScale(fontScale - 0.1),
    }
    // مقدار اولیه را اعمال کن
    const body = document.getElementById('article-content-body')
    if (body) body.style.setProperty('--article-scale', String(fontScale))
  }, [fontScale])

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
        setHtml(applyArticleTransforms(data.content || ''))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'مقاله یافت نشد')
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [params.slug])

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-site-text">جاري التحميل...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : article ? (
          <article className="max-w-[1000px] mx-auto">
            <h1 className="text-3xl font-bold text-site-text mb-4">{article.title}</h1>
          {article.description && (
            <p className="text-gray-400 mb-6">{article.description}</p>
          )}
          <div
              className="text-site-text whitespace-pre-wrap leading-7"
              dangerouslySetInnerHTML={{ __html: html }}
            />
        </article>
      ) : null}

        {/* دکمه بازگشت حذف شد */}
        

      </main>
    </div>
  )
}
