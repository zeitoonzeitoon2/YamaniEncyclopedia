'use client'

// Remove dependency on date-fns and rely on built-in JavaScript
import Image from 'next/image'
import TreeDiagramEditor from './TreeDiagramEditor'
import { getPostDisplayId } from '@/lib/postDisplay'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

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
}

interface PostCardProps {
  post: Post
  fullWidth?: boolean
  // To control hiding article link fields when displayed on the home page
  hideArticleLinkInputs?: boolean
  hideAuthorName?: boolean
  hideAuthorAvatar?: boolean
  hideHeaderId?: boolean
  showDomainNamesAtTop?: boolean
  actionsPortalId?: string
}

export function PostCard({ post, fullWidth = false, hideArticleLinkInputs = false, hideAuthorName = false, hideAuthorAvatar = false, hideHeaderId = false, showDomainNamesAtTop = false, actionsPortalId }: PostCardProps) {
  const t = useTranslations('postCard')
  const locale = useLocale()
  const [dateLabel, setDateLabel] = useState('')

  useEffect(() => {
    setDateLabel(new Date(post.createdAt).toLocaleDateString(locale))
  }, [post.createdAt, locale])

  const renderContent = () => {
    if (post.type === 'TREE') {
      try {
        const treeData = JSON.parse(post.content)
        return (
          <div className={`mt-4 ${fullWidth ? 'w-full h-full flex-1' : ''}`}>
            <TreeDiagramEditor
              initialData={treeData}
              readOnly={true}
              height={fullWidth ? '150vh' : '24rem'}
              hideArticleLinkInputs={hideArticleLinkInputs}
              showDomainNamesAtTop={showDomainNamesAtTop}
              actionsPortalId={actionsPortalId}
            />
          </div>
        )
      } catch (error) {
        return (
          <p className="text-red-400 text-sm">
            {t('treeError')}
          </p>
        )
      }
    }
    
    // For old text-based posts
    return (
      <p className="text-site-muted leading-relaxed">
        {post.content.length > 150 
          ? `${post.content.substring(0, 150)}...` 
          : post.content
        }
      </p>
    )
  }

  return (
    <div className={`card hover:shadow-lg transition-shadow ${fullWidth ? 'h-full flex flex-col' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        {post.author.image && !hideAuthorAvatar && (
          <Image
            src={post.author.image}
            alt={post.author.name || t('authorAlt')}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          {!hideAuthorName && post.author.name && (
            <p className="text-site-text font-medium">{post.author.name}</p>
          )}
          <p className="text-site-muted text-sm">
            {dateLabel}
          </p>
        </div>
      </div>
      
      {!hideHeaderId && (
        <h3 className="text-xl font-semibold text-site-text mb-3">
          {t('idLabel')} {getPostDisplayId(post, t)}
        </h3>
      )}
      
      {renderContent()}
    </div>
  )
}
