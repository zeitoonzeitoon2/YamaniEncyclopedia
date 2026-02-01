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
  poll?: {
    id: string
    question?: string | null
    options: Array<{ id: string; text: string; count: number }>
    totalVotes: number
  }
  replies: CommentNode[]
}

interface CommentSectionProps {
  postId: string
  onPickUser?: (id: string) => void
}

export default function CommentSection({ postId, onPickUser }: CommentSectionProps) {
  const { data: session } = useSession()
  const [comments, setComments] = useState<CommentNode[]>([])
  const [newComment, setNewComment] = useState('')
  const [newCategory, setNewCategory] = useState<null | 'QUESTION' | 'CRITIQUE' | 'SUPPORT' | 'SUGGESTION'>(null)
  const [replyContent, setReplyContent] = useState('')
  const [replyCategory, setReplyCategory] = useState<null | 'QUESTION' | 'CRITIQUE' | 'SUPPORT' | 'SUGGESTION'>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createPoll, setCreatePoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['',''])

  // همه کاربران لاگین کرده مجاز به ارسال کامنت هستند
  const canComment = !!session?.user
  const canCreatePoll = (session?.user?.role === 'USER' || session?.user?.role === 'EDITOR' || session?.user?.role === 'SUPERVISOR' || session?.user?.role === 'ADMIN')
  const canVotePoll = (session?.user?.role === 'SUPERVISOR' || session?.user?.role === 'ADMIN')

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
        const created = await response.json()
        setNewComment('')
        if (createPoll && canCreatePoll) {
          const opts = pollOptions.map(o => o.trim()).filter(Boolean)
          if (opts.length >= 2) {
            await fetch('/api/comments/poll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ commentId: created.id, question: pollQuestion.trim() || null, options: opts }),
            })
          }
        }
        setCreatePoll(false)
        setPollQuestion('')
        setPollOptions(['',''])
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
      <div className="bg-site-card rounded-lg p-6 border border-site-border">
        <h3 className="text-lg font-semibold text-site-text mb-4 heading">التعليقات</h3>
        <div className="text-site-muted">جارٍ التحميل...</div>
      </div>
    )
  }

  return (
    <div className="bg-site-card rounded-lg p-6 border border-site-border">
      <h3 className="text-lg font-semibold text-site-text mb-4">
        التعليقات ({comments.length})
      </h3>

      {/* فرم کامنت جدید */}
      {canComment && (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-site-muted text-sm">وسم التعليق:</label>
            <select
              value={newCategory ?? ''}
              onChange={(e) => setNewCategory(e.target.value ? (e.target.value as any) : null)}
              className="p-2 bg-site-bg text-site-text rounded border border-site-border"
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
            className="w-full p-3 bg-site-bg text-site-text placeholder:text-site-muted rounded-lg border border-site-border focus:border-warm-primary focus:outline-none resize-none"
            rows={3}
          />
          {canCreatePoll && (
            <div className="mt-3 p-3 border border-site-border rounded-lg bg-site-bg">
              <label className="inline-flex items-center gap-2 text-site-muted text-sm">
                <input type="checkbox" checked={createPoll} onChange={(e) => setCreatePoll(e.target.checked)} />
                إضافة استطلاع للرأي
              </label>
              {createPoll && (
                <div className="mt-2 space-y-2">
                  <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="السؤال (اختياري)" className="w-full p-2 bg-site-bg text-site-text rounded border border-site-border" />
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input value={opt} onChange={(e) => setPollOptions(p => { const a=[...p]; a[idx]=e.target.value; return a })} placeholder={`الخيار ${idx+1}`} className="flex-1 p-2 bg-site-bg text-site-text rounded border border-site-border" />
                      <button type="button" onClick={() => setPollOptions(p => p.filter((_,i)=>i!==idx))} className="px-2 py-1 text-xs rounded bg-red-700 text-white">حذف</button>
                    </div>
                  ))}
                  <div>
                    <button type="button" onClick={() => setPollOptions(p => [...p, ''])} className="px-3 py-1 text-sm rounded bg-warm-primary text-white">إضافة خيار</button>
                  </div>
                </div>
              )}
            </div>
          )}
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
          <div className="text-site-muted text-center py-8">لا توجد تعليقات بعد</div>
        ) : (
          comments.map((c) => (
            <div key={c.id}>{renderNode(c, 0, postId, onPickUser, canVotePoll)}</div>
          ))
        )}
      </div>
    </div>
  )
}

function renderNode(node: CommentNode, depth: number, postId: string, onPickUser?: (id: string) => void, canVotePoll?: boolean) {
  const margin = Math.min(depth * 16, 96)
  return (
    <CommentNodeView key={node.id} node={node} depth={depth} postId={postId} style={{ marginRight: margin }} onPickUser={onPickUser} canVotePoll={canVotePoll} />
  )
}

function CommentNodeView({ node, depth, postId, style, onPickUser, canVotePoll }: { node: CommentNode; depth: number; postId: string; style?: React.CSSProperties; onPickUser?: (id: string) => void; canVotePoll?: boolean }) {
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
    <div className="bg-site-secondary border border-site-border rounded-lg p-4" style={style}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {onPickUser ? (
            <button
              type="button"
              onClick={() => onPickUser(node.author.id)}
              className="rounded-full focus:outline-none"
              title="عرض منشورات هذا الباحث"
            >
              {node.author.image ? (
                <img src={node.author.image} alt={node.author.name || ''} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-warm-primary/20 text-warm-accent inline-flex items-center justify-center text-xs">
                  {(node.author.name || '؟').charAt(0)}
                </span>
              )}
            </button>
          ) : (
            <Link href={`/profile/${node.author.id}`} title="عرض الملف الشخصي">
              {node.author.image ? (
                <img src={node.author.image} alt={node.author.name || ''} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-warm-primary/20 text-warm-accent inline-flex items-center justify-center text-xs">
                  {(node.author.name || '؟').charAt(0)}
                </span>
              )}
            </Link>
          )}
          {onPickUser ? (
            <button
              type="button"
              onClick={() => onPickUser(node.author.id)}
              className="font-medium text-site-text hover:underline"
              title="عرض منشورات هذا الباحث"
            >
              {node.author.name}
            </button>
          ) : (
            <span className="font-medium text-site-text">{node.author.name}</span>
          )}
          {node.author.role === 'ADMIN' ? 'مدير' : node.author.role === 'SUPERVISOR' ? 'مشرف' : node.author.role === 'EDITOR' ? <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">محرر</span> : <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded">مستخدم</span>}
          {(() => { const cat = node.category; const label = cat === 'QUESTION' ? 'سؤال' : cat === 'CRITIQUE' ? 'نقد' : cat === 'SUPPORT' ? 'دعم' : cat === 'SUGGESTION' ? 'اقتراح تعديل' : null; if (!label) return null; const cls = cat === 'QUESTION' ? 'bg-blue-600' : cat === 'CRITIQUE' ? 'bg-red-600' : cat === 'SUPPORT' ? 'bg-green-600' : 'bg-amber-600'; return <span className={`px-2 py-1 text-xs ${cls} text-white rounded`}>{label}</span>; })()}
        </div>
        <span className="text-sm text-site-muted">{new Date(node.createdAt).toLocaleDateString('ar')}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {canComment && (
          <button
            onClick={() => setReplyToLocal(replyToLocal === node.id ? null : node.id)}
            className="px-2 py-0.5 text-xs rounded-full border border-site-border text-site-muted hover:bg-site-card"
            title="ردّ"
          >
            ردّ
          </button>
        )}
        <p className="text-site-text flex-1">{node.content}</p>
      </div>
      {node.poll && (
        <div className="mt-3 p-3 bg-site-bg border border-site-border rounded-lg">
          {node.poll.question && (
            <div className="text-site-text mb-2">{node.poll.question}</div>
          )}
          <div className="space-y-2">
            {node.poll.options.map(opt => (
              <div key={opt.id} className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={!canVotePoll}
                  onClick={async () => {
                    try {
                      if (!canVotePoll) return
                      const res = await fetch('/api/comments/poll/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId: node.poll!.id, optionId: opt.id }) })
                      if (res.ok) {
                        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('comments:reload'))
                      }
                    } catch {}
                  }}
                  className={`px-3 py-1 rounded ${canVotePoll ? 'bg-warm-primary text-white hover:bg-warm-accent' : 'bg-site-secondary text-site-muted'}`}
                >
                  {opt.text}
                </button>
                <span className="text-sm text-site-muted">{opt.count}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-site-muted mt-2">إجمالي الأصوات: {node.poll.totalVotes}</div>
        </div>
      )}
      {replyToLocal === node.id && (
        <form onSubmit={handleSubmitLocal} className="mt-3 bg-site-bg border border-site-border rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-site-muted text-sm">وسم الرد:</label>
            <select value={replyCategoryLocal ?? ''} onChange={(e) => setReplyCategoryLocal(e.target.value ? (e.target.value as any) : null)} className="p-2 bg-site-bg text-site-text rounded border border-site-border">
              <option value="">بدون وسم</option>
              <option value="QUESTION">سؤال</option>
              <option value="CRITIQUE">نقد</option>
              <option value="SUPPORT">دعم</option>
              <option value="SUGGESTION">اقتراح تعديل</option>
            </select>
          </div>
          <textarea value={replyContentLocal} onChange={(e) => setReplyContentLocal(e.target.value)} placeholder="اكتب ردّك..." className="w-full p-2 bg-site-bg text-site-text placeholder:text-site-muted rounded border border-site-border focus:border-warm-primary focus:outline-none resize-none" rows={2} />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => { setReplyToLocal(null); setReplyContentLocal('') }} className="px-3 py-1 text-sm text-site-muted hover:text-site-text">إلغاء</button>
            <button type="submit" disabled={isSubmittingLocal || !replyContentLocal.trim()} className="px-3 py-1 text-sm bg-warm-primary text-white rounded hover:bg-warm-accent disabled:opacity-50">إرسال</button>
          </div>
        </form>
      )}
      {node.replies?.length > 0 && (
        <div className="mt-4 space-y-3">
          {node.replies.map((child) => (
            <div key={child.id}>{renderNode(child, depth + 1, postId, onPickUser, canVotePoll)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
