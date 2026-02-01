'use client'

import Image from 'next/image'
import { getPostDisplayId } from '@/lib/postDisplay'

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
}

interface SimplePostCardProps {
  post: Post
  isSelected?: boolean
  onClick?: () => void
}

export function SimplePostCard({ post, isSelected = false, onClick }: SimplePostCardProps) {
  const createdDate = typeof post.createdAt === 'string'
    ? new Date(post.createdAt)
    : post.createdAt

  const getStatusColor = () => {
    switch (post.status) {
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

  const getStatusText = () => {
    switch (post.status) {
      case 'PENDING':
        return 'قيد الانتظار'
      case 'APPROVED':
        return 'تمت الموافقة'
      case 'REJECTED':
        return 'مرفوض'
      case 'REVIEWABLE':
        return 'قابل للمراجعة'
      case 'ARCHIVED':
        return 'إصدار سابق'
      default:
        return 'غير محدد'
    }
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
      {/* ترويسة مع معلومات المؤلف */}
      <div className="flex items-center gap-3 mb-3">
        {post.author.image ? (
          <Image
            src={post.author.image}
            alt={post.author.name || 'المؤلف'}
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">
              {(post.author.name || 'م').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <p className="text-site-text font-medium text-sm">{post.author.name || 'مؤلف مجهول'}</p>
          <p className="text-site-muted text-xs">
            {createdDate.toLocaleDateString('ar')}
          </p>
        </div>
        {/* شارة التعليقات الجديدة */}
        {post.unreadComments && post.unreadComments > 0 && (
          <div className="ml-2 px-2 py-1 rounded bg-red-600 text-white text-xs font-bold whitespace-nowrap">
            {post.unreadComments} تعليق جديد
          </div>
        )}
      </div>

      {/* معرّف المنشور */}
      <div className="mb-2">
        <h4 className="text-site-text font-semibold text-sm">
          المعرّف: {getPostDisplayId(post)}
        </h4>
      </div>

      {/* الحالة والنقاط */}
      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor()}`}>
          {(() => {
            switch (post.status) {
              case 'PENDING':
                return 'قيد الانتظار'
              case 'APPROVED':
                return 'تمت الموافقة'
              case 'REJECTED':
                return 'مرفوض'
              case 'REVIEWABLE':
                return 'قابل للمراجعة'
              case 'ARCHIVED':
                return 'إصدار سابق'
              default:
                return 'غير محدد'
            }
          })()}
        </span>

        {post.totalScore !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-site-muted text-xs">النقاط:</span>
            <span className={`font-bold text-xs ${
              post.totalScore > 0 ? 'text-green-400' :
              post.totalScore < 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {post.totalScore > 0 ? `+${post.totalScore}` : post.totalScore}
            </span>
          </div>
        )}
      </div>

      {/* تمت إزالة مؤشر النوع */}
    </div>
  )
}