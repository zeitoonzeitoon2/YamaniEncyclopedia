'use client'

// إزالة الاعتماد على date-fns والاكتفاء بجافاسكربت المدمجة
import Image from 'next/image'
import TreeDiagramEditor from './TreeDiagramEditor'
import { getPostDisplayId } from '@/lib/postDisplay'

interface Post {
  id: string
  version?: number | null
  revisionNumber?: number | null
  status: string
  content: string
  type?: string
  createdAt: Date
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
  // للتحكّم في إخفاء حقول رابط المقال عند العرض في الصفحة الرئيسية
  hideArticleLinkInputs?: boolean
  hideAuthorName?: boolean
  hideAuthorAvatar?: boolean
}

export function PostCard({ post, fullWidth = false, hideArticleLinkInputs = false, hideAuthorName = false, hideAuthorAvatar = false }: PostCardProps) {
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
            />
          </div>
        )
      } catch (error) {
        return (
          <p className="text-red-400 text-sm">
            خطأ في عرض مخطط الشجرة
          </p>
        )
      }
    }
    
    // للمنشورات النصية القديمة
    return (
      <p className="text-dark-muted leading-relaxed">
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
            alt={post.author.name || ''}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          {!hideAuthorName && post.author.name && (
            <p className="text-dark-text font-medium">{post.author.name}</p>
          )}
          <p className="text-dark-muted text-sm">
            {new Date(post.createdAt).toLocaleDateString('ar')}
          </p>
        </div>
      </div>
      
      <h3 className="text-xl font-semibold text-dark-text mb-3">
        المعرّف: {getPostDisplayId(post)}
      </h3>
      
      {renderContent()}
    </div>
  )
}