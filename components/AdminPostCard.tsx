'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'react-hot-toast'
// حذف وابستگی به date-fns و استفاده از JavaScript داخلی
import { User, Calendar } from 'lucide-react'
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
  const [isVoting, setIsVoting] = useState(false)
  
  const votingFinalized = ['APPROVED', 'REJECTED', 'ARCHIVED'].includes(post.status)

  const handleVote = async (score: number) => {
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
        toast.success('رای شما ثبت شد')
      } else {
        toast.error('خطا در ثبت رای')
      }
    } catch (error) {
      console.error('Error voting:', error)
      toast.error('خطا در ثبت رای')
    } finally {
      setIsVoting(false)
    }
  }

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
            خطا در نمایش نمودار درختی
          </p>
        )
      }
    }
    
    // برای پست‌های متنی قدیمی
    return (
      <p className="text-dark-muted mb-6 leading-relaxed">{post.content}</p>
    )
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {post.author.image ? (
            <img
              src={post.author.image}
              alt={post.author.name || 'نویسنده'}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 bg-dark-card rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-dark-muted" />
            </div>
          )}
          <div>
            <p className="text-dark-text font-medium">{post.author.name || 'کاربر ناشناس'}</p>
            <p className="text-dark-muted text-sm flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.createdAt).toLocaleDateString('fa-IR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {post.totalScore !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-dark-card rounded-lg">
              <span className="text-dark-muted text-sm">امتیاز:</span>
              <span className={`font-bold ${post.totalScore > 0 ? 'text-green-400' : post.totalScore < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                {post.totalScore}
              </span>
            </div>
          )}
        </div>
      </div>

      <h3 className="text-xl font-bold text-dark-text mb-3">شناسه: {getPostDisplayId(post)}</h3>
      {renderContent()}

      {/* سیستم رای‌گیری */}
      {currentAdminId && !votingFinalized && (
        <div className="mb-6 p-4 bg-dark-card rounded-lg">
          <h4 className="text-dark-text font-medium mb-3">رای‌گیری ناظر</h4>
          <div className="flex items-center gap-2 mb-3">
            {[-2, -1, 0, 1, 2].map((score) => (
              <button
                key={score}
                onClick={() => handleVote(score)}
                disabled={isVoting}
                className={`px-3 py-2 rounded-lg transition-colors ${
                  currentVote === score
                    ? 'bg-warm-primary text-white'
                    : 'bg-dark-bg hover:bg-gray-700 text-dark-text'
                } ${isVoting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {score > 0 ? `+${score}` : score}
              </button>
            ))}
          </div>
          {currentVote !== null && (
            <p className="text-dark-muted text-sm">
              رای فعلی شما: {currentVote > 0 ? `+${currentVote}` : currentVote}
            </p>
          )}
        </div>
      )}

      {currentAdminId && votingFinalized && post.status === 'APPROVED' && (
        <div className="mb-6 p-4 rounded-lg border border-green-700 bg-green-900/20 text-green-300 text-sm">
          این طرح به حد نصاب مشارکت و امتیاز رسیده و منتشر شده است برای همین نظرسنجی متوقف شده است. اگر نقدی به این طرح دارید در کامنت ها مطرح کنید و ایده های خود را در یک طرح جدید ارسال کنید.
        </div>
      )}


    </div>
  )
}