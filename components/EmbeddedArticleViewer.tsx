"use client";

import React from 'react'
import { X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslations } from 'next-intl'

/**
 * Internal article viewer component for displaying article drafts within the current context.
 * Used for comparing the original article with a proposed version.
 */
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
  const t = useTranslations('embeddedArticleViewer')
  const [originalContent, setOriginalContent] = React.useState<string>(t('loading'))
  const [proposedContent, setProposedContent] = React.useState<string>(t('loading'))
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function fetchArticles() {
      setLoading(true)
      setError(null)
      try {
        // 1. Load original content if it exists
        if (originalArticleLink) {
          try {
            const res = await fetch(`/api/articles/${originalArticleLink}`)
            if (res.ok) {
              const data = await res.json()
              setOriginalContent(data.content || '')
            } else {
              setOriginalContent(t('articleNotFound'))
            }
          } catch (err) {
            console.error('Error fetching original article:', err)
            setOriginalContent(t('loadError'))
          }
        } else {
          setOriginalContent(t('noArticleLinked'))
        }

        // 2. Load proposed content
        // If it's a slug, fetch from API; if it's raw content, use it directly
        if (proposedArticleLink) {
          // Check if proposedArticleLink looks like a slug (no spaces, relatively short)
          const isSlug = !proposedArticleLink.includes(' ') && proposedArticleLink.length < 100
          
          if (isSlug) {
            try {
              const res = await fetch(`/api/articles/get-by-slug?slug=${proposedArticleLink}`)
              if (res.ok) {
                const data = await res.json()
                setProposedContent(data.content || '')
              } else {
                setProposedContent(t('articleNotFound'))
              }
            } catch (err) {
              console.error('Error fetching proposed article:', err)
              setProposedContent(t('loadError'))
            }
          } else {
            // It's likely the content itself
            setProposedContent(proposedArticleLink)
          }
        } else if (postContent) {
          // If no link, use postContent if provided
          setProposedContent(postContent)
        } else {
          setProposedContent(t('noArticleLinked'))
        }

      } catch (err) {
        console.error('General error in EmbeddedArticleViewer:', err)
        setError(t('loadError'))
      } finally {
        setLoading(false)
      }
    }

    fetchArticles()
  }, [originalArticleLink, proposedArticleLink, postContent, initialProposedContent, t])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
      <div className="relative w-full max-w-7xl h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
            {t('title')}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
            title={t('close')}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* Left Side: Current Article */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-6 py-3 bg-slate-100/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('currentArticle')}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 prose dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {originalContent}
              </ReactMarkdown>
            </div>
          </div>

          {/* Right Side: Proposed Article */}
          <div className="flex-1 flex flex-col min-w-0 bg-blue-50/20 dark:bg-blue-900/10">
            <div className="px-6 py-3 bg-blue-100/30 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                {t('proposedArticle')}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 prose dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {proposedContent}
              </ReactMarkdown>
            </div>
          </div>

        </div>

        {/* Footer info (optional) */}
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-600 dark:text-slate-300 font-medium">{t('loading')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}