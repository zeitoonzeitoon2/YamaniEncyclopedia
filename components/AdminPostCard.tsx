'use client'

import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'react-hot-toast'
import { useTranslations, useLocale } from 'next-intl'
// Remove date-fns dependency and use internal JavaScript
import { User, Calendar } from 'lucide-react'
import Image from 'next/image'
import TreeDiagramEditor from './TreeDiagramEditor'
import { getPostDisplayId } from '@/lib/postDisplay'

interface AdminPostCardProps {
  post: {
    id: string
    version?: number | null
    revisionNumber?: number | null
    status: string
    content: string
    type?: string
    createdAt: string
    author: {
      name: string | null
      image: string | null
    }
    votes?: Array<{
      id: string
      score: number
      adminId: string
    }>
    totalScore?: number
    originalPost?: {
      version?: number | null
    } | null
  }
  onStatusChange: () => void
  currentAdminId?: string
}

export function AdminPostCard({ post, onStatusChange, currentAdminId }: AdminPostCardProps) {
  const t = useTranslations('adminPostCard')
  const tPost = useTranslations('postCard')
  const locale = useLocale()
  const [isVoting, setIsVoting] = useState(false)
  
  const votingFinalized = ['APPROVED', 'REJECTED', 'ARCHIVED'].includes(post.status)

  const handleVote = useCallback(async (score: number) => {
    if (!currentAdminId) return
    
    setIsVoting(true)
    try {
      const response = await fetch(`/api/supervisor/posts/${post.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ score }),
      })

      if (response.ok) {
        onStatusChange()
        toast.success(t('voteSuccess'))
      } else {
        toast.error(t('voteError'))
      }
    } catch (error) {
      console.error('Error voting:', error)
      toast.error(t('voteError'))
    } finally {
      setIsVoting(false)
    }
  }, [currentAdminId, post.id, onStatusChange, t])

  const getCurrentUserVote = () => {
    if (!currentAdminId || !post.votes) return null
    return post.votes.find(vote => vote.adminId === currentAdminId)?.score || null
  }

  const currentVote = getCurrentUserVote()

  const renderContent = () => {
    if (post.type === 'TREE') {
      try {
        const treeData = JSON.parse(post.content)
        return (
          <div className="mb-6">
            <TreeDiagramEditor
              initialData={treeData}
              readOnly={true}
            />
          </div>
        )
      } catch (error) {
        return (
          <p className="text-red-400 text-sm mb-6">
            {t('treeError')}
          </p>
        )
      }
    }
    
    // For old text posts
    return (
      <p className="text-site-muted mb-6 leading-relaxed">{post.content}</p>
    )
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {post.author.image ? (
            <Image
              src={post.author.image}
              alt={post.author.name || t('authorAlt')}
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <div className="w-10 h-10 bg-site-card rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-site-muted" />
            </div>
          )}
          <div>
            <p className="text-site-text font-medium">{post.author.name || t('unknownUser')}</p>
            <p className="text-site-muted text-sm flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.createdAt).toLocaleDateString(locale)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {post.totalScore !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-site-card rounded-lg">
              <span className="text-site-muted text-sm">{t('points')}</span>
              <span className={`font-bold ${post.totalScore > 0 ? 'text-green-400' : post.totalScore < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                {post.totalScore}
              </span>
            </div>
          )}
        </div>
      </div>

      <h3 className="text-xl font-bold text-site-text mb-3">{t('idPrefix')} {getPostDisplayId(post, tPost)}</h3>
      {renderContent()}

      {/* Voting system */}
      {currentAdminId && !votingFinalized && (
        <div className="mb-6 p-4 bg-site-card rounded-lg">
          <h4 className="text-site-text font-medium mb-3">{t('supervisorVote')}</h4>
          <div className="flex items-center gap-2 mb-3">
            {[-2, -1, 0, 1, 2].map((score) => (
              <button
                key={score}
                onClick={() => handleVote(score)}
                disabled={isVoting}
                className={`px-3 py-2 rounded-lg transition-colors ${
                  currentVote === score
                    ? 'bg-warm-primary text-white'
                    : 'bg-site-bg hover:bg-gray-700 text-site-text'
                } ${isVoting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {score > 0 ? `+${score}` : score}
              </button>
            ))}
          </div>
          {currentVote !== null && (
            <p className="text-site-muted text-sm">
              {t('currentVote', { score: currentVote > 0 ? `+${currentVote}` : currentVote })}
            </p>
          )}
        </div>
      )}

      {currentAdminId && votingFinalized && post.status === 'APPROVED' && (
        <div className="mb-6 p-4 rounded-lg border border-green-700 bg-green-900/20 text-green-300 text-sm">
          {t('votingClosed')}
        </div>
      )}


    </div>
  )
}
