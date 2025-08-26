'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface Comment {
  id: string
  content: string
  createdAt: string
  author: {
    id: string
    name: string
    role: string
  }
  replies: Reply[]
}

interface Reply {
  id: string
  content: string
  createdAt: string
  author: {
    id: string
    name: string
    role: string
  }
}

interface CommentSectionProps {
  postId: string
}

export default function CommentSection({ postId }: CommentSectionProps) {
  const { data: session } = useSession()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [replyContent, setReplyContent] = useState('')
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
          <div className="text-amber-200 text-center py-8">
            لا توجد تعليقات بعد
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bg-stone-900 border border-amber-700/30 rounded-lg p-4">
              {/* کامنت اصلی */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-100">{comment.author.name}</span>
                  {getRoleBadge(comment.author.role)}
                </div>
                <span className="text-sm text-amber-300">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              
              <p className="text-amber-50 mb-3">{comment.content}</p>

              {/* دکمه پاسخ */}
              {canComment && (
                <button
                  onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  className="text-sm text-amber-300 hover:text-amber-200"
                >
                  ردّ
                </button>
              )}

              {/* فرم پاسخ */}
              {replyTo === comment.id && (
                <form
                  onSubmit={(e) => handleSubmitReply(e, comment.id)}
                  className="mt-3 bg-stone-900 border border-amber-700/40 rounded-lg p-3"
                >
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="اكتب ردّك..."
                    className="w-full p-2 bg-stone-900 text-amber-50 rounded border border-amber-700/40 focus:border-amber-500 focus:outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null)
                        setReplyContent('')
                      }}
                      className="px-3 py-1 text-sm text-amber-300 hover:text-amber-100"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !replyContent.trim()}
                      className="px-3 py-1 text-sm bg-warm-primary text-white rounded hover:bg-warm-accent disabled:opacity-50"
                    >
                      إرسال
                    </button>
                  </div>
                </form>
              )}

              {/* پاسخ‌ها */}
              {comment.replies.length > 0 && (
                <div className="mt-4 space-y-3">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="bg-stone-900 border border-amber-700/30 rounded-lg p-3 mr-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-amber-100">{reply.author.name}</span>
                          {getRoleBadge(reply.author.role)}
                        </div>
                        <span className="text-sm text-amber-300">
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-amber-50">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}