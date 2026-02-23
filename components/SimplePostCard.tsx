'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getPostDisplayId } from '@/lib/postDisplay'
import { useTranslations, useLocale } from 'next-intl'

interface Post {
  id: string
  version?: number | null
  revisionNumber?: number | null
  status: string
  content: string
  type?: string
  createdAt: Date | string
  author: {
    name: string | null
    image: string | null
  }
  originalPost?: {
    version?: number | null
  } | null
  totalScore?: number
  unreadComments?: number
  relatedDomains?: { id: string; name: string }[]
}

interface SimplePostCardProps {
  post: Post
  isSelected?: boolean
  onClick?: () => void
}

export function SimplePostCard({ post, isSelected = false, onClick }: SimplePostCardProps) {
  const t = useTranslations('postCard')
  const locale = useLocale()
  const [imageError, setImageError] = useState(false)
  const createdDate = typeof post.createdAt === 'string'
    ? new Date(post.createdAt)
    : post.createdAt

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'REVIEWABLE':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusText = (status: string) => {
    return t(`status.${status}`) || t('status.UNKNOWN')
  }

  return (
    <div
      className={`cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-warm-primary bg-opacity-10 border-2 border-warm-primary rounded-lg'
          : 'bg-site-card hover:bg-site-card hover:bg-opacity-80 border border-site-border rounded-lg'
      } p-4 mb-2`}
      onClick={onClick}
    >
      {/* Header with author information */}
      <div className="flex items-center gap-3 mb-3">
        {post.author.image && !imageError ? (
          <Image
            src={post.author.image}
            alt={post.author.name || t('authorAlt')}
            width={32}
            height={32}
            className="rounded-full"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">
              {(post.author.name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <p className="text-site-text font-medium text-sm">{post.author.name || t('unknownAuthor')}</p>
          <p className="text-site-muted text-xs">
            {createdDate.toLocaleDateString('en-GB')}
          </p>
        </div>
        {/* New comments badge */}
        {post.unreadComments && post.unreadComments > 0 && (
          <div className="ml-2 px-2 py-1 rounded bg-red-600 text-white text-xs font-bold whitespace-nowrap">
            {t('newComments', { count: post.unreadComments })}
          </div>
        )}
      </div>

      {/* Post identifier */}
      <div className="mb-2">
        <h4 className="text-site-text font-semibold text-sm">
          {t('idLabel')} {getPostDisplayId(post, t)}
        </h4>
      </div>

      {/* Domain Tags */}
      {post.relatedDomains && post.relatedDomains.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {post.relatedDomains.map((domain) => (
            <span 
              key={domain.id} 
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {domain.name}
            </span>
          ))}
        </div>
      )}

      {/* Status and score */}
      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(post.status)}`}>
          {getStatusText(post.status)}
        </span>

        {post.totalScore !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-site-muted text-xs">{t('scoreLabel')}</span>
            <span className={`font-bold text-xs ${
              post.totalScore > 0 ? 'text-green-400' :
              post.totalScore < 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {post.totalScore > 0 ? `+${post.totalScore}` : post.totalScore}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
