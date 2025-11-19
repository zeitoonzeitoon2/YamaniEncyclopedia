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
  const [isPostsLoading, setIsPostsLoading] = useState(false)
  const [postsPagination, setPostsPagination] = useState({ page: 1, pageSize: 20, totalCount: 0 })
  
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

  const fetchPostDetails = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/supervisor/posts/${postId}`, { credentials: 'include' })
      if (!res.ok) {
        console.error('Failed to fetch post details:', res.status, await res.text())
        toast.error('خطأ في تحميل المعلومات')
        return null
      }
      const post = await res.json()
      // به‌روزرسانی selectedPost و به‌روزرسانی آیتم در لیست
      setSelectedPost(post)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...post } : p))
      return post
    } catch (e) {
      console.error('Failed to fetch post details', e)
      toast.error('خطأ في تحميل المعلومات')
      return null
    }
  }, [])

  const openPostById = useCallback(async (postId: string) => {
    const found = posts.find(p => p.id === postId)
    if (found) {
      // اگر محتوا در لیست وجود ندارد، جزییات را Lazy بارگذاری کن
      if (!found.content || !found.originalPost?.content) {
        await fetchPostDetails(postId)
      } else {
        setSelectedPost(found)
      }
      setTimeout(() => {
        const el = document.getElementById('comments')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return
    }

    try {
      // Ensure posts are loaded, then select
      await fetchPosts()
      setTimeout(async () => {
        setPosts(curr => {
          const f = curr.find(p => p.id === postId)
          if (f) {
            // همان چک Lazy بعد از رفرش لیست
            if (!f.content || !f.originalPost?.content) {
              fetchPostDetails(postId)
            } else {
              setSelectedPost(f)
            }
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
  }, [posts, fetchPostDetails])

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
      toast.error('لا تملك صلاحيات المشرف')
      router.push('/')
      return
    }

    console.log('Calling fetchPosts')
    fetchPosts()
  }, [session, status, router])

  // عند قراءة CommentSection، قم بإعادة تعيين شارة القائمة إلى الصفر
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

  // الحصول على التصويت الحالي للمستخدم للمنشور المحدد
  useEffect(() => {
    if (selectedPost && session?.user) {
      const userVote = selectedPost.votes?.find(vote => vote.adminId === session.user.id)
      setCurrentUserVote(userVote?.score)
    } else {
      setCurrentUserVote(undefined)
    }
  }, [selectedPost, session?.user])

  const fetchPosts = async (page?: number, pageSize?: number) => {
    setIsPostsLoading(true)
    try {
      const p = page ?? postsPagination.page
      const ps = pageSize ?? postsPagination.pageSize
      console.log('Fetching posts...', p, ps)
      const params = new URLSearchParams({ page: String(p), pageSize: String(ps) })
      // الحصول على المنشورات (صفحة مُقسّمة)
      const postsResponse = await fetch(`/api/editor/posts?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
      console.log('Posts response status:', postsResponse.status)
      if (postsResponse.ok) {
        const data = await postsResponse.json()
        const items = Array.isArray(data) ? data : (data.items || [])
        const totalCount = Array.isArray(data) ? items.length : Number((data.totalCount || items.length))
        console.log('Posts data received:', items.length, 'items')
        // حساب النقاط الإجمالية لكل منشور
        const postsWithScores = (items as Post[]).map((post: Post) => {
          const totalScore = post.votes ? post.votes.reduce((sum, vote) => sum + vote.score, 0) : 0
          return {
            ...post,
            totalScore
          }
        })
        console.log('Setting posts:', postsWithScores.length)
        setPosts(postsWithScores)
        setPostsPagination(prev => ({ ...prev, page: p, pageSize: ps, totalCount }))
      } else {
        console.error('Failed to fetch posts:', postsResponse.status, postsResponse.statusText)
        toast.error('خطأ في تحميل المعلومات')
      }

      // الحصول على إحصائيات المشرفين
      const statsResponse = await fetch('/api/supervisor/stats', { credentials: 'include' })
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setAdminStats(statsData)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      toast.error('خطأ في تحميل المعلومات')
    } finally {
      setIsPostsLoading(false)
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
        toast.success('تم تسجيل تصويتك')
        setCurrentUserVote(score)
        
        // فحص النشر التلقائي
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
            toast.success(`تم ${result.action === 'approved' ? 'الموافقة والنشر' : 'الرفض'}`)
          }
        }

        // تحديث قائمة المنشورات
        await fetchPosts()
        
        // تحديث selectedPost بالبيانات الجديدة من القائمة المحدّثة
        if (selectedPost) {
          // العثور على المنشور المحدّث في القائمة الجديدة
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
        toast.error(errorData.error || 'خطأ في تسجيل التصويت')
      }
    } catch (error) {
      console.error('Vote error:', error)
      toast.error('خطأ في تسجيل التصويت')
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      {/* removed debug banner */}
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-dark-text mb-8 text-center heading">
          لوحة المشرف
        </h1>

        {/* إحصاءات المقارنة - عرض الإحصاءات التحليلية لبطاقة آخر منشور محدّد */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* بطاقة العُقَد */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-dark-text heading">العُقَد</h3>
            <div className="flex justify-around mt-3">
              <div className="text-center">
                <p className="text-xl font-bold text-green-400">{comparisonStats?.nodes.added || 0}</p>
                <p className="text-xs text-dark-muted">أُضيفت</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-400">{comparisonStats?.nodes.removed || 0}</p>
                <p className="text-xs text-dark-muted">حُذِفت</p>
              </div>
            </div>
          </div>

          {/* بطاقة بطاقات التذكّر */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-dark-text heading">بطاقات البيانات</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.flashcards.added || 0}</p>
                <p className="text-xs text-dark-muted">أُضيفت</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.flashcards.removed || 0}</p>
                <p className="text-xs text-dark-muted">حُذِفت</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.flashcards.edited || 0}</p>
                <p className="text-xs text-dark-muted">تعديل</p>
              </div>
            </div>
          </div>

          {/* بطاقة المقالات */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-dark-text heading">المقالات</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.articles.added || 0}</p>
                <p className="text-xs text-dark-muted">أُضيفت</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.articles.removed || 0}</p>
                <p className="text-xs text-dark-muted">حُذِفت</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.articles.edited || 0}</p>
                <p className="text-xs text-dark-muted">تعديل</p>
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
                <h2 className="text-xl font-bold text-dark-text heading">التصاميم المقترحة</h2>
              )}
              <button
                onClick={() => setIsPostsListCollapsed(!isPostsListCollapsed)}
                className="p-2 rounded-lg bg-dark-card text-dark-text hover:bg-gray-700 transition-colors"
                title={isPostsListCollapsed ? 'عرض قائمة التصاميم' : 'إخفاء قائمة التصاميم'}
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
                    onClick={() => openPostById(post.id)}  // تغییر: به‌جای setSelectedPost(post)
                    title={`المعرّف: ${getPostDisplayId(post)}`}
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
                    title="عرض التصاميم الجديدة"
                  >
                    <span className={`${filter === 'new_designs' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{newDesignsCount}</span>
                    <span className="whitespace-nowrap">تصاميم جديدة</span>
                  </button>

                  <button
                    onClick={() => setFilter('new_comments')}
                    aria-pressed={filter === 'new_comments'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'new_comments'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="عرض المنشورات التي بها تعليقات جديدة"
                  >
                    <span className={`${filter === 'new_comments' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{totalUnreadComments}</span>
                    <span className="whitespace-nowrap">تعليقات جديدة</span>
                  </button>

                  <button
                    onClick={() => setFilter('reviewables')}
                    aria-pressed={filter === 'reviewables'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'reviewables'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="عرض العناصر القابلة للمراجعة"
                  >
                    <span className={`${filter === 'reviewables' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{reviewablesCount}</span>
                    <span className="whitespace-nowrap">قابلة للمراجعة</span>
                  </button>
                </div>

                {isPostsLoading ? (
                  <div className="text-center py-12">
                    <p className="text-dark-muted">جارٍ التحميل...</p>
                  </div>
                ) : (
                  <>
                    {filter === 'new_comments' ? (
                      recentComments.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-dark-muted text-lg">لا توجد تعليقات</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                          {recentComments.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => openPostById(c.post.id)}
                              className="w-full text-right bg-dark-card hover:bg-gray-800/60 transition-colors rounded-lg p-3 border border-gray-700"
                              title={`فتح التصميم المرتبط بهذا التعليق`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="inline-flex items-center gap-1 text-xs text-dark-muted">
                                  <span className="px-2 py-0.5 rounded-full border border-gray-600 bg-gray-800 text-gray-200">
                                    {getPostDisplayId({ id: c.post.id, version: c.post.version ?? null, revisionNumber: c.post.revisionNumber ?? null, status: c.post.status, originalPost: c.post.originalPost ?? null })}
                                  </span>
                                  <span className="truncate">{c.author.name || 'مجهول'} • {new Date(c.createdAt).toLocaleDateString('ar')}</span>
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
                              لا توجد تصاميم في هذه الفئة
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4 max-h-[600px] overflow-y-auto">
                            {filteredPosts.map((post) => (
                              <div key={post.id} className={`${selectedPost?.id === post.id ? 'ring-2 ring-warm-primary rounded-xl' : ''}`}>
                                <SimplePostCard
                                  post={{ ...post, createdAt: new Date(post.createdAt) } as any}
                                  isSelected={selectedPost?.id === post.id}
                                  onClick={() => openPostById(post.id)}  // تغییر: به‌جای setSelectedPost(post)
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
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
                <h2 className="text-xl font-bold text-dark-text mb-4 heading">تفاصيل التصميم</h2>
                <div className="card mb-6">
                  <h3 className="font-bold text-lg text-dark-text mb-2 heading">المعرّف: {getPostDisplayId(selectedPost)}</h3>
                  <p className="text-dark-muted text-sm mb-4">
                    الكاتب: {selectedPost.author.name || 'مجهول'} ({selectedPost.author.role})
                  </p>
                  
                  {/* Voting */}
                  <div className="mb-4">
                    {selectedPost.status === 'APPROVED' ? (
                      <div className="p-3 rounded-lg border border-green-700 bg-green-900/20 text-green-300 text-sm">
                        تم الوصول إلى حد المشاركة والتقييم ونُشر هذا التصميم، لذلك تم إيقاف التصويت. إذا كانت لديك ملاحظات فاذكرها في التعليقات، وأرسل أفكارك في تصميم جديد.
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
                        <span>عتبة التقييم: <b>{adminStats.threshold}</b></span>
                        <span>عتبة المشاركة: <b>{adminStats.participationThreshold}</b></span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-4">
                      <span>
                        إجمالي التقييم: <span className={`font-bold ${
                          (selectedPost.totalScore || 0) > 0 ? 'text-green-600' : 
                          (selectedPost.totalScore || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {selectedPost.totalScore || 0}
                        </span>
                      </span>
                      <span>عدد المشاركين: <b>{supervisorParticipation}</b></span>
                    </div>
                  </div>
                </div>

                {/* Diagram Comparison */}
                {selectedPost.type === 'TREE' && (
                  <div className="mb-6">
                    {selectedPost.originalPost ? (
                      <div>
                        <h4 className="font-bold text-lg text-dark-text mb-4 heading">المخطط المقترح</h4>
                        {originalDiagramData && proposedDiagramData ? (
                          <>
                            {/* Legend: دليل الألوان */}
                            <div className="mb-4">
                              <div className="bg-dark-card border border-gray-700 rounded-lg p-3 text-sm text-dark-text">
                                <div className="font-semibold mb-2 heading">دليل الألوان</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Nodes legend */}
                                  <div>
                                    <div className="text-xs text-dark-muted mb-1">العُقَد</div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 text-xs">أخضر: عُقدة جديدة</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800 text-xs">أحمر: عُقدة محذوفة</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">أزرق: تغيير الاسم</span>
                                    </div>
                                  </div>
                                  {/* Stroke legend */}
                                  <div>
                                    <div className="text-xs text-dark-muted mb-1">حدود بطاقة البيانات</div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-green-500 bg-transparent" />
                                        بطاقة بيانات جديدة
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-red-500 bg-transparent" />
                                        حذف بطاقة البيانات
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-blue-500 bg-transparent" />
                                        تعديل بطاقة البيانات
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
            خطأ في عرض المخططات: بيانات غير صالحة
          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-bold text-lg text-dark-text mb-4 heading">المخطط المقترح</h4>
                        {proposedDiagramData ? (
                          <div className="h-96 border border-gray-300 rounded-lg overflow-hidden">
                            <TreeDiagramEditor
                              initialData={proposedDiagramData}
                              readOnly={true}
                            />
                          </div>
                        ) : (
                          <div className="text-red-400 text-center py-4">
                            خطأ في عرض المخططات: بيانات غير صالحة
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
                  يرجى اختيار تصميم لعرض التفاصيل
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}