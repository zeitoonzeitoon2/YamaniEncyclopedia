'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Link } from '@/lib/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations, useLocale } from 'next-intl'

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
  postId?: string
  chapterId?: string
  onPickUser?: (id: string) => void
}

// User role badge
const getRoleBadge = (role: string, t: any) => {
  switch (role) {
    case 'ADMIN':
      return <span className="px-2 py-1 text-xs bg-red-600 text-white rounded">{t('roles.ADMIN')}</span>
    case 'EXPERT':
      return <span className="px-2 py-1 text-xs bg-amber-600 text-white rounded">{t('roles.EXPERT')}</span>
    case 'EDITOR':
      return <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">{t('roles.EDITOR')}</span>
    case 'USER':
      return <span className="px-2 py-1 text-xs bg-gray-600 text-white rounded">{t('roles.USER')}</span>
    default:
      return null
  }
}

const categoryLabel = (cat: string | undefined, t: any) => {
  if (!cat) return null
  return t(`tags.${cat}`)
}

const categoryBadge = (cat: string | undefined, t: any) => {
  const label = categoryLabel(cat, t)
  if (!label) return null
  const cls = cat === 'QUESTION' ? 'bg-blue-600' : cat === 'CRITIQUE' ? 'bg-red-600' : cat === 'SUPPORT' ? 'bg-green-600' : 'bg-amber-600'
  return <span className={`px-2 py-1 text-xs ${cls} text-white rounded`}>{label}</span>
}

export default function CommentSection({ postId, chapterId, onPickUser }: CommentSectionProps) {
  const { data: session } = useSession()
  const t = useTranslations('comments')
  const locale = useLocale()
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

  // All logged-in users are allowed to post comments
  const canComment = !!session?.user
  const canCreatePoll = (session?.user?.role === 'USER' || session?.user?.role === 'EDITOR' || session?.user?.role === 'EXPERT' || session?.user?.role === 'ADMIN')
  const canVotePoll = (session?.user?.role === 'EXPERT' || session?.user?.role === 'ADMIN')

  // Load comments
  const loadComments = useCallback(async () => {
    const targetId = postId || chapterId
    if (!targetId) {
      setIsLoading(false)
      return
    }
    const query = postId ? `postId=${postId}` : `chapterId=${chapterId}`
    try {
      const response = await fetch(`/api/comments?${query}`)
      if (response.ok) {
        const data = await response.json()
        setComments(data)
        if (postId) {
          try {
            await fetch('/api/comments/mark-read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ postId }),
            })
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('comments:read', { detail: { postId } }))
            }
          } catch (e) {
            console.warn('mark-read failed', e)
          }
        }
      }
    } catch (error) {
      console.error(t('error.load'), error)
    } finally {
      setIsLoading(false)
    }
  }, [postId, chapterId, t])

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

  // Submit new comment
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
          ...(postId ? { postId } : {}),
          ...(chapterId ? { chapterId } : {}),
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
      console.error(t('error.submit'), error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-site-card rounded-lg p-6 border border-site-border">
        <h3 className="text-lg font-semibold text-site-text mb-4 heading">{t('title')}</h3>
        <div className="text-site-muted">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="bg-site-card rounded-lg p-6 border border-site-border">
      <h3 className="text-lg font-semibold text-site-text mb-4">
        {t('count', { count: comments.length })}
      </h3>

      {/* New comment form */}
      {canComment && (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-site-muted text-sm">{t('tagLabel')}</label>
            <select
              value={newCategory ?? ''}
              onChange={(e) => setNewCategory(e.target.value ? (e.target.value as any) : null)}
              className="p-2 bg-site-bg text-site-text rounded border border-site-border"
            >
              <option value="">{t('tagNone')}</option>
              <option value="QUESTION">{t('tags.QUESTION')}</option>
              <option value="CRITIQUE">{t('tags.CRITIQUE')}</option>
              <option value="SUPPORT">{t('tags.SUPPORT')}</option>
              <option value="SUGGESTION">{t('tags.SUGGESTION')}</option>
            </select>
          </div>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('placeholder')}
            className="w-full p-3 bg-site-bg text-site-text placeholder:text-site-muted rounded-lg border border-site-border focus:border-warm-primary focus:outline-none resize-none"
            rows={3}
          />
          {canCreatePoll && (
            <div className="mt-3 p-3 border border-site-border rounded-lg bg-site-bg">
              <label className="inline-flex items-center gap-2 text-site-muted text-sm">
                <input type="checkbox" checked={createPoll} onChange={(e) => setCreatePoll(e.target.checked)} />
                {t('poll.create')}
              </label>
              {createPoll && (
                <div className="mt-2 space-y-2">
                  <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder={t('poll.question')} className="w-full p-2 bg-site-bg text-site-text rounded border border-site-border" />
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input value={opt} onChange={(e) => setPollOptions(p => { const a=[...p]; a[idx]=e.target.value; return a })} placeholder={t('poll.option', { index: idx + 1 })} className="flex-1 p-2 bg-site-bg text-site-text rounded border border-site-border" />
                      <button type="button" onClick={() => setPollOptions(p => p.filter((_,i)=>i!==idx))} className="px-2 py-1 text-xs rounded bg-red-700 text-white">{t('actions.delete')}</button>
                    </div>
                  ))}
                  <div>
                    <button type="button" onClick={() => setPollOptions(p => [...p, ''])} className="px-3 py-1 text-sm rounded bg-warm-primary text-white">{t('poll.addOption')}</button>
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
              {isSubmitting ? t('loading') : t('submit')}
            </button>
          </div>
        </form>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-site-muted text-center py-8">{t('empty')}</div>
        ) : (
          comments.map((c) => (
            <div key={c.id}>{renderNode(c, 0, postId, chapterId, onPickUser, canVotePoll, t, locale)}</div>
          ))
        )}
      </div>
    </div>
  )
}

function renderNode(node: CommentNode, depth: number, postId: string | undefined, chapterId: string | undefined, onPickUser: ((id: string) => void) | undefined, canVotePoll: boolean | undefined, t: any, locale: string) {
  const margin = Math.min(depth * 16, 96)
  return (
    <CommentNodeView key={node.id} node={node} depth={depth} postId={postId} chapterId={chapterId} style={{ marginRight: margin }} onPickUser={onPickUser} canVotePoll={canVotePoll} t={t} locale={locale} />
  )
}

function CommentNodeView({ node, depth, postId, chapterId, style, onPickUser, canVotePoll, t, locale }: { node: CommentNode; depth: number; postId?: string; chapterId?: string; style?: React.CSSProperties; onPickUser?: (id: string) => void; canVotePoll?: boolean; t: any; locale: string }) {
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
        body: JSON.stringify({
          content: replyContentLocal.trim(),
          ...(postId ? { postId } : {}),
          ...(chapterId ? { chapterId } : {}),
          parentId: node.id,
          ...(replyCategoryLocal ? { category: replyCategoryLocal } : {}),
        }),
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
              title={t('researcherSearch.viewResearcher')}
            >
              {node.author.image ? (
                <img src={node.author.image} alt={node.author.name || ''} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-warm-primary/20 text-warm-accent inline-flex items-center justify-center text-xs">
                  {(node.author.name || '?').charAt(0)}
                </span>
              )}
            </button>
          ) : (
            <Link href={`/profile/${node.author.id}`} title={t('researcherSearch.viewResearcher')}>
              {node.author.image ? (
                <img src={node.author.image} alt={node.author.name || ''} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-warm-primary/20 text-warm-accent inline-flex items-center justify-center text-xs">
                  {(node.author.name || '?').charAt(0)}
                </span>
              )}
            </Link>
          )}
          {onPickUser ? (
            <button
              type="button"
              onClick={() => onPickUser(node.author.id)}
              className="font-medium text-site-text hover:underline"
              title={t('researcherSearch.viewResearcher')}
            >
              {node.author.name}
            </button>
          ) : (
            <span className="font-medium text-site-text">{node.author.name}</span>
          )}
          {getRoleBadge(node.author.role, t)}
          {categoryBadge(node.category, t)}
        </div>
        <span className="text-sm text-site-muted">{new Date(node.createdAt).toLocaleDateString(locale)}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {canComment && (
          <button
            onClick={() => setReplyToLocal(replyToLocal === node.id ? null : node.id)}
            className="px-2 py-0.5 text-xs rounded-full border border-site-border text-site-muted hover:bg-site-card"
            title={t('reply')}
          >
            {t('reply')}
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
          <div className="text-xs text-site-muted mt-2">{t('poll.votes', { count: node.poll.totalVotes })}</div>
        </div>
      )}
      {replyToLocal === node.id && (
        <form onSubmit={handleSubmitLocal} className="mt-3 bg-site-bg border border-site-border rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-site-muted text-sm">{t('tagLabel')}</label>
            <select value={replyCategoryLocal ?? ''} onChange={(e) => setReplyCategoryLocal(e.target.value ? (e.target.value as any) : null)} className="p-2 bg-site-bg text-site-text rounded border border-site-border">
              <option value="">{t('tagNone')}</option>
              <option value="QUESTION">{t('tags.QUESTION')}</option>
              <option value="CRITIQUE">{t('tags.CRITIQUE')}</option>
              <option value="SUPPORT">{t('tags.SUPPORT')}</option>
              <option value="SUGGESTION">{t('tags.SUGGESTION')}</option>
            </select>
          </div>
          <textarea value={replyContentLocal} onChange={(e) => setReplyContentLocal(e.target.value)} placeholder={t('placeholder')} className="w-full p-2 bg-site-bg text-site-text placeholder:text-site-muted rounded border border-site-border focus:border-warm-primary focus:outline-none resize-none" rows={2} />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => { setReplyToLocal(null); setReplyContentLocal('') }} className="px-3 py-1 text-sm text-site-muted hover:text-site-text">{t('cancel')}</button>
            <button type="submit" disabled={isSubmittingLocal || !replyContentLocal.trim()} className="px-3 py-1 text-sm bg-warm-primary text-white rounded hover:bg-warm-accent disabled:opacity-50">{t('submit')}</button>
          </div>
        </form>
      )}
      {node.replies?.length > 0 && (
        <div className="mt-4 space-y-3">
          {node.replies.map((child) => (
            <div key={child.id}>{renderNode(child, depth + 1, postId, chapterId, onPickUser, canVotePoll, t, locale)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
