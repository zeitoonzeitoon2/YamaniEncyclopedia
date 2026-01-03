'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface CommentNode {
  id: string
  content: string
  category?: string
  createdAt: string
  author: {
    id: string
    name: string
    role: string
    image?: string | null
  }
  replies: CommentNode[]
}

interface CommentSectionProps {
  postId: string
}

export default function CommentSection({ postId }: CommentSectionProps) {
  const { data: session } = useSession()
  const [comments, setComments] = useState<CommentNode[]>([])
  const [newComment, setNewComment] = useState('')
  const [newCategory, setNewCategory] = useState<null | 'QUESTION' | 'CRITIQUE' | 'SUPPORT' | 'SUGGESTION'>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyCategory, setReplyCategory] = useState<null | 'QUESTION' | 'CRITIQUE' | 'SUPPORT' | 'SUGGESTION'>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // همه کاربران لاگین کرده مجاز به ارسال کامنت هستند
  const canComment = !!session?.user

  // بارگذاری کامنت‌ها
  const loadComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?postId=${postId}`)
      if (response.ok) {
        const data = await response.json()
        setComments(data)
        // پس از لود موفق، به عنوان خوانده‌شده علامت بزن
        try {
          await fetch('/api/comments/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ postId }),
          })
          // بروزرسانی نشان کارت با رویداد عمومی
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('comments:read', { detail: { postId } }))
          }
        } catch (e) {
          console.warn('mark-read failed', e)
        }
      }
    } catch (error) {
      console.error('خطا در بارگذاری کامنت‌ها:', error)
    } finally {
      setIsLoading(false)
    }
  }, [postId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  useEffect(() => {
    const handler = () => loadComments()
    if (typeof window !== 'undefined') {
      window.addEventListener('comments:reload', handler as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('comments:reload', handler as EventListener)
      }
    }
  }, [loadComments])

  // ارسال کامنت جدید
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canComment || !newComment.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment.trim(),
          postId,
          ...(newCategory ? { category: newCategory } : {}),
        }),
      })

      if (response.ok) {
        setNewComment('')
        await loadComments()
      }
    } catch (error) {
      console.error('خطا در ارسال کامنت:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ارسال پاسخ
  const handleSubmitReply = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault()
    if (!canComment || !replyContent.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: replyContent.trim(),
          postId,
          parentId: commentId,
          ...(replyCategory ? { category: replyCategory } : {}),
        }),
      })

      if (response.ok) {
        setReplyContent('')
        setReplyTo(null)
        await loadComments()
      }
    } catch (error) {
      console.error('خطا در ارسال پاسخ:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // نشان نقش کاربر
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'مدير'
      case 'SUPERVISOR':
        return 'مشرف'
      case 'EDITOR':
        return <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">محرر</span>
      case 'USER':
        return <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded">مستخدم</span>
      default:
        return null
    }
  }

  // فرمت تاریخ
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const categoryLabel = (cat?: string) => {
    switch (cat) {
      case 'QUESTION': return 'سؤال'
      case 'CRITIQUE': return 'نقد'
      case 'SUPPORT': return 'دعم'
      case 'SUGGESTION': return 'اقتراح تعديل'
      default: return null
    }
  }

  const categoryBadge = (cat?: string) => {
    const label = categoryLabel(cat)
    if (!label) return null
    const cls = cat === 'QUESTION' ? 'bg-blue-600' : cat === 'CRITIQUE' ? 'bg-red-600' : cat === 'SUPPORT' ? 'bg-green-600' : 'bg-amber-600'
    return <span className={`px-2 py-1 text-xs ${cls} text-white rounded`}>{label}</span>
  }

  if (isLoading) {
    return (
      <div className="bg-stone-800 rounded-lg p-6 border border-amber-700/40">
        <h3 className="text-lg font-semibold text-amber-100 mb-4 heading">التعليقات</h3>
        <div className="text-amber-200">جارٍ التحميل...</div>
      </div>
    )
  }

  return (
    <div className="bg-stone-800 rounded-lg p-6 border border-amber-700/40">
      <h3 className="text-lg font-semibold text-amber-100 mb-4">
        التعليقات ({comments.length})
      </h3>

      {/* فرم کامنت جدید */}
      {canComment && (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-amber-200 text-sm">وسم التعليق:</label>
            <select
              value={newCategory ?? ''}
              onChange={(e) => setNewCategory(e.target.value ? (e.target.value as any) : null)}
              className="p-2 bg-stone-900 text-amber-50 rounded border border-amber-700/40"
            >
              <option value="">بدون وسم</option>
              <option value="QUESTION">سؤال</option>
              <option value="CRITIQUE">نقد</option>
              <option value="SUPPORT">دعم</option>
              <option value="SUGGESTION">اقتراح تعديل</option>
            </select>
          </div>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="اكتب تعليقك..."
            className="w-full p-3 bg-stone-900 text-amber-50 placeholder:opacity-60 rounded-lg border border-amber-700/40 focus:border-amber-500 focus:outline-none resize-none"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={isSubmitting || !newComment.trim()}
              className="px-4 py-2 bg-warm-primary text-white rounded-lg hover:bg-warm-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'جارٍ الإرسال...' : 'إرسال التعليق'}
            </button>
          </div>
        </form>
      )}

      {/* لیست کامنت‌ها */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-amber-200 text-center py-8">لا توجد تعليقات بعد</div>
        ) : (
          comments.map((c) => (
            <div key={c.id}>{renderNode(c, 0, postId)}</div>
          ))
        )}
      </div>
    </div>
  )
}

function renderNode(node: CommentNode, depth: number, postId: string) {
  const margin = Math.min(depth * 16, 96)
  return (
    <CommentNodeView key={node.id} node={node} depth={depth} postId={postId} style={{ marginRight: margin }} />
  )
}

function CommentNodeView({ node, depth, postId, style }: { node: CommentNode; depth: number; postId: string; style?: React.CSSProperties }) {
  const { data: session } = useSession()
  const canComment = !!session?.user
  const [replyToLocal, setReplyToLocal] = useState<string | null>(null)
  const [replyContentLocal, setReplyContentLocal] = useState('')
  const [replyCategoryLocal, setReplyCategoryLocal] = useState<null | 'QUESTION' | 'CRITIQUE' | 'SUPPORT' | 'SUGGESTION'>(null)
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)

  const handleSubmitLocal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canComment || !replyContentLocal.trim() || isSubmittingLocal) return
    setIsSubmittingLocal(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContentLocal.trim(), postId, parentId: node.id, ...(replyCategoryLocal ? { category: replyCategoryLocal } : {}) }),
      })
      if (res.ok) {
        setReplyToLocal(null)
        setReplyContentLocal('')
        if (typeof window !== 'undefined') {
          const ev = new CustomEvent('comments:reload')
          window.dispatchEvent(ev)
        }
      }
    } finally {
      setIsSubmittingLocal(false)
    }
  }

  return (
    <div className="bg-stone-900 border border-amber-700/30 rounded-lg p-4" style={style}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${node.author.id}`} title="عرض الملف الشخصي">
            {node.author.image ? (
              <img src={node.author.image} alt={node.author.name || ''} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-amber-700/30 text-amber-200 inline-flex items-center justify-center text-xs">
                {(node.author.name || '؟').charAt(0)}
              </span>
            )}
          </Link>
          <span className="font-medium text-amber-100">{node.author.name}</span>
          {node.author.role === 'ADMIN' ? 'مدير' : node.author.role === 'SUPERVISOR' ? 'مشرف' : node.author.role === 'EDITOR' ? <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">محرر</span> : <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded">مستخدم</span>}
          {(() => { const cat = node.category; const label = cat === 'QUESTION' ? 'سؤال' : cat === 'CRITIQUE' ? 'نقد' : cat === 'SUPPORT' ? 'دعم' : cat === 'SUGGESTION' ? 'اقتراح تعديل' : null; if (!label) return null; const cls = cat === 'QUESTION' ? 'bg-blue-600' : cat === 'CRITIQUE' ? 'bg-red-600' : cat === 'SUPPORT' ? 'bg-green-600' : 'bg-amber-600'; return <span className={`px-2 py-1 text-xs ${cls} text-white rounded`}>{label}</span>; })()}
        </div>
        <span className="text-sm text-amber-300">{new Date(node.createdAt).toLocaleDateString('ar')}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {canComment && (
          <button
            onClick={() => setReplyToLocal(replyToLocal === node.id ? null : node.id)}
            className="px-2 py-0.5 text-xs rounded-full border border-amber-700/50 text-amber-300 hover:bg-gray-800/60"
            title="ردّ"
          >
            ردّ
          </button>
        )}
        <p className="text-amber-50 flex-1">{node.content}</p>
      </div>
      {replyToLocal === node.id && (
        <form onSubmit={handleSubmitLocal} className="mt-3 bg-stone-900 border border-amber-700/40 rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-amber-200 text-sm">وسم الرد:</label>
            <select value={replyCategoryLocal ?? ''} onChange={(e) => setReplyCategoryLocal(e.target.value ? (e.target.value as any) : null)} className="p-2 bg-stone-900 text-amber-50 rounded border border-amber-700/40">
              <option value="">بدون وسم</option>
              <option value="QUESTION">سؤال</option>
              <option value="CRITIQUE">نقد</option>
              <option value="SUPPORT">دعم</option>
              <option value="SUGGESTION">اقتراح تعديل</option>
            </select>
          </div>
          <textarea value={replyContentLocal} onChange={(e) => setReplyContentLocal(e.target.value)} placeholder="اكتب ردّك..." className="w-full p-2 bg-stone-900 text-amber-50 rounded border border-amber-700/40 focus:border-amber-500 focus:outline-none resize-none" rows={2} />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => { setReplyToLocal(null); setReplyContentLocal('') }} className="px-3 py-1 text-sm text-amber-300 hover:text-amber-100">إلغاء</button>
            <button type="submit" disabled={isSubmittingLocal || !replyContentLocal.trim()} className="px-3 py-1 text-sm bg-warm-primary text-white rounded hover:bg-warm-accent disabled:opacity-50">إرسال</button>
          </div>
        </form>
      )}
      {node.replies?.length > 0 && (
        <div className="mt-4 space-y-3">
          {node.replies.map((child) => (
            <div key={child.id}>{renderNode(child, depth + 1, postId)}</div>
          ))}
        </div>
      )}
    </div>
  )
}