'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import CommentSection from '@/components/CommentSection'
import DiagramComparison from '@/components/DiagramComparison'
import EnhancedDiagramComparison from '@/components/EnhancedDiagramComparison'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import VotingSlider from '@/components/VotingSlider'
import { SimplePostCard } from '@/components/SimplePostCard'
import toast from 'react-hot-toast'
import { getPostDisplayId } from '@/lib/postDisplay'

interface Post {
  id: string
  version?: number | null
  revisionNumber?: number | null
  content: string
  articlesData?: string | null  // JSON string for article data
  type: string
  status: string
  createdAt: string
  author: {
    id: string
    name: string | null
    email: string | null
    image: string | null
    role: string
  }
  originalPost?: {
    id: string
    version?: number | null
    content: string
    type: string
  } | null
  votes?: Array<{
    id: string
    score: number
    adminId: string
    admin?: { name?: string | null; role?: string }
  }>
  totalScore?: number
  _count?: {
    comments: number
  }
  unreadComments?: number
}

interface RecentComment {
  id: string
  content: string
  createdAt: string
  author: { id: string; name: string | null; role: string }
  post: {
    id: string
    version?: number | null
    revisionNumber?: number | null
    status: string
    originalPost?: { version?: number | null } | null
  }
}

export default function SupervisorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'new_designs' | 'new_comments' | 'reviewables'>('new_designs')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  
  console.log('SupervisorDashboard render - posts:', posts.length, 'selectedPost:', selectedPost?.id)
  
  // Debug: Add visual indicator
  useEffect(() => {
    console.log('SupervisorDashboard mounted, posts:', posts.length)
  }, [posts])
  const [isPostsListCollapsed, setIsPostsListCollapsed] = useState(false)
  const [adminStats, setAdminStats] = useState<{supervisorCount: number; adminCount: number; combinedCount: number; threshold: number; participationThreshold: number} | null>(null)
  const [currentUserVote, setCurrentUserVote] = useState<number | undefined>(undefined)
  const [comparisonStats, setComparisonStats] = useState<{
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  } | null>(null)
  const [recentComments, setRecentComments] = useState<RecentComment[]>([])
  
  const supervisorParticipation = useMemo(() => {
    if (!selectedPost?.votes) return 0
    return selectedPost.votes.filter(v => {
      const role = (v as any)?.admin?.role
      return role === 'SUPERVISOR' || role === 'ADMIN'
    }).length
  }, [selectedPost])
  
  // Memoize parsed diagram data to avoid recreating objects on every render
  const originalDiagramData = useMemo(() => {
    if (!selectedPost?.originalPost?.content) return null
    try {
      return JSON.parse(selectedPost.originalPost.content)
    } catch {
      return null
    }
  }, [selectedPost?.originalPost?.content])

  const proposedDiagramData = useMemo(() => {
    if (!selectedPost?.content) return null
    try {
      return JSON.parse(selectedPost.content)
    } catch {
      return null
    }
  }, [selectedPost?.content])

  // Stable callback to avoid recreating function identity on each render
  const handleStatsChange = useCallback((stats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => {
    setComparisonStats(stats)
  }, [])

  const fetchRecentComments = useCallback(async () => {
    try {
      const res = await fetch('/api/comments/all', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setRecentComments(data)
      } else {
        console.error('Failed to fetch recent comments: ', await res.text())
      }
    } catch (e) {
      console.error('Failed to fetch recent comments', e)
    }
  }, [])

  useEffect(() => {
    if (filter === 'new_comments') {
      fetchRecentComments()
    }
  }, [filter, fetchRecentComments])

  const openPostById = useCallback(async (postId: string) => {
    const found = posts.find(p => p.id === postId)
    if (found) {
      setSelectedPost(found)
      setTimeout(() => {
        const el = document.getElementById('comments')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return
    }

    try {
      // Ensure posts are loaded, then select
      await fetchPosts()
      setTimeout(() => {
        setPosts(curr => {
          const f = curr.find(p => p.id === postId)
          if (f) {
            setSelectedPost(f)
            setTimeout(() => {
              const el = document.getElementById('comments')
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 50)
          }
          return curr
        })
      }, 200)
    } catch (e) {
      console.error('Failed to open post by id', e)
    }
  }, [posts])

  useEffect(() => {
    console.log('useEffect triggered - status:', status, 'session:', !!session, 'role:', session?.user?.role)
    if (status === 'loading') {
      console.log('Status is loading, returning')
      return
    }
    
    if (!session) {
      console.log('No session, redirecting to /')
      router.push('/')
      return
    }

    if (session.user?.role !== 'SUPERVISOR' && session.user?.role !== 'ADMIN') {
      console.log('User role not authorized:', session.user?.role)
      toast.error('ليست لديك صلاحية المشرف')
      router.push('/')
      return
    }

    console.log('Calling fetchPosts')
    fetchPosts()
  }, [session, status, router])

  // زمانی که در CommentSection خوانده شد، نشان لیست را صفر کن
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId: string }
      if (!detail?.postId) return
      setPosts(prev => prev.map(p => p.id === detail.postId ? { ...p, unreadComments: 0 } : p))
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('comments:read', handler as EventListener)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('comments:read', handler as EventListener)
      }
    }
  }, [])

  // دریافت رای فعلی کاربر برای پست انتخاب شده
  useEffect(() => {
    if (selectedPost && session?.user) {
      const userVote = selectedPost.votes?.find(vote => vote.adminId === session.user.id)
      setCurrentUserVote(userVote?.score)
    } else {
      setCurrentUserVote(undefined)
    }
  }, [selectedPost, session?.user])

  const fetchPosts = async () => {
    try {
      console.log('Fetching posts...')
      // دریافت پست‌ها
      const postsResponse = await fetch('/api/supervisor/posts', { credentials: 'include' })
      console.log('Posts response status:', postsResponse.status)
      if (postsResponse.ok) {
        const data = await postsResponse.json()
        console.log('Posts data received:', data.length, 'posts')
        // محاسبه امتیاز کل برای هر پست
        const postsWithScores = data.map((post: Post) => {
          const totalScore = post.votes ? post.votes.reduce((sum, vote) => sum + vote.score, 0) : 0
          return {
            ...post,
            totalScore
          }
        })
        console.log('Setting posts:', postsWithScores.length)
        setPosts(postsWithScores)
      } else {
        console.error('Failed to fetch posts:', postsResponse.status, postsResponse.statusText)
        toast.error('خطأ في تحميل البيانات')
      }

      // دریافت آمار ناظرها
      const statsResponse = await fetch('/api/supervisor/stats', { credentials: 'include' })
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setAdminStats(statsData)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      toast.error('خطا در بارگذاری اطلاعات')
    } finally {
      setLoading(false)
    }
  }



  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">جارٍ التحميل...</div>
      </div>
    )
  }

  const filteredPosts = posts.filter(post => {
    switch (filter) {
      case 'new_designs':
        return true
      case 'new_comments':
        return (post.unreadComments || 0) > 0
      case 'reviewables':
        return post.status === 'REVIEWABLE'
      default:
        return true
    }
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const newDesignsCount = posts.length
  const totalUnreadComments = posts.reduce((sum, p) => sum + (p.unreadComments || 0), 0)
  const reviewablesCount = posts.filter(p => p.status === 'REVIEWABLE').length
  const pendingCount = posts.filter(p => p.status === 'PENDING').length
  const approvedCount = posts.filter(p => p.status === 'APPROVED').length
  const rejectedCount = posts.filter(p => p.status === 'REJECTED').length

  const handleVote = async (postId: string, score: number) => {
    try {
      const response = await fetch('/api/supervisor/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, score }),
      })

      if (response.ok) {
        toast.success('رای شما ثبت شد')
        setCurrentUserVote(score)
        
        // بررسی انتشار خودکار
        const autoPublishResponse = await fetch('/api/supervisor/auto-publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ postId }),
        })

        if (autoPublishResponse.ok) {
          const result = await autoPublishResponse.json()
          if (result.published) {
            toast.success(`طرح ${result.action === 'approved' ? 'تایید و منتشر' : 'رد'} شد`)
          }
        }

        // بروزرسانی لیست پست‌ها
        await fetchPosts()
        
        // بروزرسانی selectedPost با داده‌های جدید از فهرست بروزرسانی شده
        if (selectedPost) {
          // پیدا کردن پست بروزرسانی شده در فهرست جدید
          setTimeout(() => {
            setPosts(currentPosts => {
              const updatedPost = currentPosts.find(p => p.id === postId)
              if (updatedPost) {
                setSelectedPost(updatedPost)
              }
              return currentPosts
            })
          }, 100)
        }
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'خطا در ثبت رای')
      }
    } catch (error) {
      console.error('Vote error:', error)
      toast.error('خطا در ثبت رای')
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      {/* removed debug banner */}
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-dark-text mb-8 text-center heading">
          داشبورد ناظر
        </h1>

        {/* Comparison Stats - نمایش آمار تحلیلی کارت آخرین پست انتخاب شده */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* کارت گره‌ها */}
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">گره‌ها</h3>
            <div className="flex justify-around mt-3">
              <div className="text-center">
                <p className="text-xl font-bold text-green-400">{comparisonStats?.nodes.added || 0}</p>
                <p className="text-xs text-dark-muted">اضافه شده</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-400">{comparisonStats?.nodes.removed || 0}</p>
                <p className="text-xs text-dark-muted">حذف شده</p>
              </div>
            </div>
          </div>

          {/* کارت فلش کارت‌ها */}
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">فلش کارت‌ها</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.flashcards.added || 0}</p>
                <p className="text-xs text-dark-muted">اضافه</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.flashcards.removed || 0}</p>
                <p className="text-xs text-dark-muted">حذف</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.flashcards.edited || 0}</p>
                <p className="text-xs text-dark-muted">ویرایش</p>
              </div>
            </div>
          </div>

          {/* کارت مقالات */}
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">مقالات</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.articles.added || 0}</p>
                <p className="text-xs text-dark-muted">اضافه</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.articles.removed || 0}</p>
                <p className="text-xs text-dark-muted">حذف</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.articles.edited || 0}</p>
                <p className="text-xs text-dark-muted">ویرایش</p>
              </div>
            </div>
          </div>
        </div>


        {/* Posts */}
        <div className="flex gap-6">
          {/* Collapsible Posts List */}
          <div className={`transition-all duration-300 ${
            isPostsListCollapsed ? 'w-12' : 'w-80 lg:w-96'
          }`}>
            <div className="flex items-center justify-between mb-4">
              {!isPostsListCollapsed && (
                <h2 className="text-xl font-bold text-dark-text heading">طرح‌های پیشنهادی</h2>
              )}
              <button
                onClick={() => setIsPostsListCollapsed(!isPostsListCollapsed)}
                className="p-2 rounded-lg bg-dark-card text-dark-text hover:bg-gray-700 transition-colors"
                title={isPostsListCollapsed ? 'نمایش لیست طرح‌ها' : 'مخفی کردن لیست طرح‌ها'}
              >
                {isPostsListCollapsed ? '📋' : '◀'}
              </button>
            </div>
            
            {isPostsListCollapsed ? (
              // Mini posts list when collapsed
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredPosts.slice(0, 10).map((post) => (
                  <div
                    key={post.id}
                    className={`w-8 h-8 rounded cursor-pointer transition-colors flex items-center justify-center text-xs font-bold ${
                      selectedPost?.id === post.id
                        ? 'bg-warm-primary text-white'
                        : post.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : post.status === 'APPROVED'
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-red-100 text-red-800 hover:bg-red-200'
                    }`}
                    onClick={() => setSelectedPost(post)}
                    title={`شناسه: ${getPostDisplayId(post)}`}
                  >
                    {getPostDisplayId(post).charAt(0)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Compact filter toolbar above posts list */}
                <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setFilter('new_designs')}
                    aria-pressed={filter === 'new_designs'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'new_designs'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش طرح‌های جدید"
                  >
                    <span className={`${filter === 'new_designs' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{newDesignsCount}</span>
                    <span className="whitespace-nowrap">طرح‌های جدید</span>
                  </button>

                  <button
                    onClick={() => setFilter('new_comments')}
                    aria-pressed={filter === 'new_comments'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'new_comments'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش پست‌های دارای کامنت جدید"
                  >
                    <span className={`${filter === 'new_comments' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{totalUnreadComments}</span>
                    <span className="whitespace-nowrap">کامنت‌های جدید</span>
                  </button>

                  <button
                    onClick={() => setFilter('reviewables')}
                    aria-pressed={filter === 'reviewables'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'reviewables'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش قابل بررسی‌ها"
                  >
                    <span className={`${filter === 'reviewables' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{reviewablesCount}</span>
                    <span className="whitespace-nowrap">قابل بررسی‌ها</span>
                  </button>
                </div>

                {filter === 'new_comments' ? (
                  recentComments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-dark-muted text-lg">هیچ کامنتی وجود ندارد</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {recentComments.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => openPostById(c.post.id)}
                          className="w-full text-right bg-dark-card hover:bg-gray-800/60 transition-colors rounded-lg p-3 border border-gray-700"
                          title={`باز کردن طرح مربوط به این کامنت`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="inline-flex items-center gap-1 text-xs text-dark-muted">
                              <span className="px-2 py-0.5 rounded-full border border-gray-600 bg-gray-800 text-gray-200">
                                {getPostDisplayId({ id: c.post.id, version: c.post.version ?? null, revisionNumber: c.post.revisionNumber ?? null, status: c.post.status, originalPost: c.post.originalPost ?? null })}
                              </span>
                              <span className="truncate">{c.author.name || 'ناشناس'} • {new Date(c.createdAt).toLocaleDateString('ar')}</span>
                            </span>
                          </div>
                          <div className="text-sm text-dark-text line-clamp-2">
                            {c.content}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <>
                    {filteredPosts.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-dark-muted text-lg">
                          هیچ طرحی در این دسته‌بندی وجود ندارد
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {filteredPosts.map((post) => (
                          <div key={post.id} className={`${selectedPost?.id === post.id ? 'ring-2 ring-warm-primary rounded-xl' : ''}`}>
                            <SimplePostCard 
                              post={{...post, createdAt: new Date(post.createdAt) } as any} 
                              isSelected={selectedPost?.id === post.id}
                              onClick={() => setSelectedPost(post)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Post Details */}
          <div className="flex-1">
            {selectedPost ? (
              <div>
                <h2 className="text-xl font-bold text-dark-text mb-4 heading">جزئیات طرح</h2>
                <div className="card mb-6">
                  <h3 className="font-bold text-lg text-dark-text mb-2 heading">شناسه: {getPostDisplayId(selectedPost)}</h3>
                  <p className="text-dark-muted text-sm mb-4">
                    نویسنده: {selectedPost.author.name || 'ناشناس'} ({selectedPost.author.role})
                  </p>
                  
                  {/* Voting */}
                  <div className="mb-4">
                    {selectedPost.status === 'APPROVED' ? (
                      <div className="p-3 rounded-lg border border-green-700 bg-green-900/20 text-green-300 text-sm">
                        این طرح به حد نصاب مشارکت و امتیاز رسیده و منتشر شده است برای همین نظرسنجی متوقف شده است. اگر نقدی به این طرح دارید در کامنت ها مطرح کنید و ایده های خود را در یک طرح جدید ارسال کنید.
                      </div>
                    ) : (
                      <VotingSlider
                        currentVote={currentUserVote}
                        onVote={(score) => handleVote(selectedPost.id, score)}
                        disabled={['REJECTED','ARCHIVED'].includes(selectedPost.status)}
                      />
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center text-sm text-dark-muted">
                    {adminStats ? (
                      <div className="flex items-center gap-4">
                        <span>آستانه امتیاز: <b>{adminStats.threshold}</b></span>
                        <span>آستانه مشارکت: <b>{adminStats.participationThreshold}</b></span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-4">
                      <span>
                        امتیاز کل: <span className={`font-bold ${
                          (selectedPost.totalScore || 0) > 0 ? 'text-green-600' : 
                          (selectedPost.totalScore || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {selectedPost.totalScore || 0}
                        </span>
                      </span>
                      <span>تعداد مشارکت: <b>{supervisorParticipation}</b></span>
                    </div>
                  </div>
                </div>

                {/* Diagram Comparison */}
                {selectedPost.type === 'TREE' && (
                  <div className="mb-6">
                    {selectedPost.originalPost ? (
                      <div>
                        <h4 className="font-bold text-lg text-dark-text mb-4 heading">مقایسه نمودارها</h4>
                        {originalDiagramData && proposedDiagramData ? (
                          <>
                            {/* Legend: راهنمای رنگ‌ها */}
                            <div className="mb-4">
                              <div className="bg-dark-card border border-gray-700 rounded-lg p-3 text-sm text-dark-text">
                                <div className="font-semibold mb-2 heading">راهنمای رنگ‌ها</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Nodes legend */}
                                  <div>
                                    <div className="text-xs text-dark-muted mb-1">گره‌ها</div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 text-xs">سبز: گره جدید</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800 text-xs">قرمز: گره حذف‌شده</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">آبی: تغییر نام</span>
                                    </div>
                                  </div>
                                  {/* Stroke legend */}
                                  <div>
                                    <div className="text-xs text-dark-muted mb-1">استروک فلش‌کارت</div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-green-500 bg-transparent" />
                                        سبز: فلش‌کارت جدید
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-red-500 bg-transparent" />
                                        قرمز: حذف فلش‌کارت
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-blue-500 bg-transparent" />
                                        آبی: ویرایش فلش‌کارت
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <EnhancedDiagramComparison
                              originalData={originalDiagramData}
                              proposedData={proposedDiagramData}
                              articlesData={selectedPost.articlesData || undefined}
                              onStatsChange={handleStatsChange}
                            />
                          </>
                        ) : (
                          <div className="text-red-400 text-center py-4">
                            خطا در نمایش نمودارها: داده‌های نامعتبر
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-bold text-lg text-dark-text mb-4 heading">نمودار پیشنهادی</h4>
                        {proposedDiagramData ? (
                          <div className="h-96 border border-gray-300 rounded-lg overflow-hidden">
                            <TreeDiagramEditor
                              initialData={proposedDiagramData}
                              readOnly={true}
                            />
                          </div>
                        ) : (
                          <div className="text-red-400 text-center py-4">
                            خطا در نمایش نمودار: داده‌های نامعتبر
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Comments Section */}
                <div id="comments">
                  <CommentSection postId={selectedPost.id} />
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-dark-muted text-lg">
                  یک طرح را انتخاب کنید تا جزئیات آن نمایش داده شود
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}