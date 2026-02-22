'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import VisualEditor from './VisualEditor'

interface QuickArticleModalProps {
  isOpen: boolean
  onClose: () => void
  onArticleCreated: (articleSlug: string) => void
  // If this mode is enabled, we will return a draft instead of creating an actual article
  createViaAPI?: boolean
  onDraftCreated?: (draft: { title: string; description?: string; content: string; slug: string }) => void
  onDraftChange?: (draft: { title: string; description?: string; content: string }) => void
  // For editing a draft article
  editMode?: boolean
  existingDraft?: { title: string; description?: string; content: string; slug: string }
}

export default function QuickArticleModal({
  isOpen,
  onClose,
  onArticleCreated,
  createViaAPI,
  onDraftCreated,
  onDraftChange,
  editMode,
  existingDraft,
}: QuickArticleModalProps) {
  const t = useTranslations('quickArticle')
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: ''
  })

  // --- New: ref and footnote insertion functions ---
  const visualEditorRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... same code as before but use visualEditorRef.current?.insertText
    const file = e.target.files?.[0]
    if (!file) return

    const caption = prompt(t('imageCaptionPrompt')) || ''

    setIsUploadingImage(true)
    const toastId = toast.loading(t('uploadingImage'))

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/articles/upload', {
        method: 'POST',
        body: fd
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || t('uploadFailed'))
      }

      const { url } = await res.json()
      const imgMarkdown = `\n!image[${url}|${caption}]\n`
      if (visualEditorRef.current) {
        visualEditorRef.current.insertText(imgMarkdown)
      } else {
        setFormData(prev => ({ ...prev, content: prev.content + imgMarkdown }))
      }
      toast.success(t('uploadSuccess'), { id: toastId })
    } catch (error: any) {
      console.error('Image upload error:', error)
      toast.error(error.message || t('uploadError'), { id: toastId })
    } finally {
      setIsUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const getNextFootnoteNumber = (text: string) => {
    let maxNum = 0
    // References
    const refRe = /\[\^(\d+)\]/g
    // Definitions
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
    const current = visualEditorRef.current?.getMarkdown() || formData.content || ''
    const nextNum = getNextFootnoteNumber(current)
    const refText = `[^${nextNum}]`
    const defText = `\n\n[^${nextNum}]: `

    if (visualEditorRef.current) {
      visualEditorRef.current.insertText(refText)
      // For the definition, we append it to the end if not exists
      if (!current.includes(`[^${nextNum}]:`)) {
        setFormData(prev => {
          const updated = prev.content + defText
          onDraftChange?.({ ...prev, content: updated })
          return { ...prev, content: updated }
        })
      }
    } else {
      // Fallback
      const updated = current + refText + (current.includes(`[^${nextNum}]:`) ? '' : defText)
      setFormData(prev => {
        const next = { ...prev, content: updated }
        onDraftChange?.(next)
        return next
      })
    }
  }

  // Load existing article data in edit mode
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

  // Lock page scroll while the window is open
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Generate a preliminary slug from the title (for display to the user) and also used in draft mode
  const previewSlug = (title: string) => {
    const normalized = (title || '')
      .toLowerCase()
      .trim()
      // Normalize Persian characters to Arabic
      .replace(/[ی]/g, 'ي')
      .replace(/[ک]/g, 'ك')
      // Remove zero-width non-joiner and bidi control marks
      .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
    const slug = normalized
      .replace(/\s+/g, '-')
      // Remove any disallowed characters except Arabic and hyphen
      .replace(/[^\w\-\u0600-\u06FF]/g, '')
      // Consolidate consecutive hyphens into one
      .replace(/\-\-+/g, '-')
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, '')
    return slug || 'article'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!session) {
      toast.error(t('loginRequired'))
      return
    }

    if (!formData.title || !formData.content) {
      toast.error(t('titleAndContentRequired'))
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
              slug: existingDraft.slug // Preserve existing slug
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
          toast.success(editMode ? t('draftEdited') : t('draftCreated'))
          if (editMode) {
            const slug = result?.newSlug || result?.article?.slug || existingDraft?.slug
            if (slug) onArticleCreated(slug)
          } else {
            // API returns the full article object, so we need to access the slug property
            onArticleCreated(result.slug || result.article?.slug)
          }
          setFormData({ title: '', description: '', content: '' })
          onClose()
        } else {
          const error = await response.json()
          toast.error(editMode ? t('editError') : t('createError'))
        }
      } else {
        // Draft mode: don't create article, just return data to parent component
        // For edits, keep the same original slug so that the same article is updated after approval
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
        toast.success(editMode ? t('draftEdited') : t('draftCreated'))
        setFormData({ title: '', description: '', content: '' })
        onClose()
      }
    } catch (error) {
      console.error('Error creating/editing article:', error)
      toast.error(editMode ? t('editError') : t('createError'))
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
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-site-secondary rounded-lg shadow-xl w-[95vw] h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 flex-shrink-0">
          <h2 className="text-xl font-bold text-site-text">
            {editMode ? t('modalTitleEdit') : t('modalTitleCreate')}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            aria-label={t('close')}
            title={t('close')}
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="space-y-4 h-full flex flex-col">
            {/* Article title */}
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-site-text mb-2">
                {t('titleLabel')}
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData(prev => {
                    const next = { ...prev, title: e.target.value }
                    onDraftChange?.(next)
                    return next
                  })
                }
                className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                placeholder={t('titlePlaceholder')}
                required
                autoFocus
              />
              {formData.title && (
                <p className="text-xs text-gray-400 mt-1 break-words">
                  {t('urlPreview', { slug: previewSlug(formData.title) })}
                </p>
              )}
            </div>

            {/* Article summary */}
            <div className="flex-shrink-0">
              <label className="block text-sm font-medium text-site-text mb-2">
                {t('descriptionLabel')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData(prev => {
                    const next = { ...prev, description: e.target.value }
                    onDraftChange?.(next)
                    return next
                  })
                }
                className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                rows={2}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>

            {/* Article content */}
            <div className="flex-1 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <label className="block text-sm font-medium text-site-text">
                  {t('contentLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={insertFootnoteAtCursor}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50 flex items-center gap-1"
                    title={t('footnoteTitle')}
                  >
                    <span>+</span>
                    {t('addFootnote')}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50 flex items-center gap-1"
                    title={t('imageTitle')}
                  >
                    {isUploadingImage ? '...' : t('addImage')}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>
              
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <VisualEditor 
                  ref={visualEditorRef}
                  content={formData.content}
                  onChange={(markdown) => {
                    setFormData(prev => ({ ...prev, content: markdown }))
                    onDraftChange?.({ ...formData, content: markdown })
                  }}
                  placeholder={t('contentPlaceholder')}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-4 pt-4 flex-shrink-0">
              <button
                type="submit"
                disabled={loading || !formData.title || !formData.content}
                className="btn-primary flex-1"
              >
                {loading 
                  ? (editMode ? t('loadingEdit') : t('loadingCreate')) 
                  : editMode 
                    ? t('submitEdit')
                    : (createViaAPI ? t('submitCreate') : t('submitCreateDraft'))
                }
              </button>
              
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
              >
                {t('closeButton')}
              </button>
            </div>
          </form>

          <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/40">
            <p className="text-xs text-blue-300 break-words">
              {t('hint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
