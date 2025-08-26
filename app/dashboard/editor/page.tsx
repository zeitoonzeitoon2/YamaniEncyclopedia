'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import CommentSection from '@/components/CommentSection'
import { getPostDisplayId } from '@/lib/postDisplay'
import toast from 'react-hot-toast'
import EnhancedDiagramComparison from '@/components/EnhancedDiagramComparison'
import { SimplePostCard } from '@/components/SimplePostCard'

interface Post {
  id: string
  content: string
  status: string
  version: number | null
  revisionNumber: number | null
  createdAt: string
  type: string
  articlesData?: string | null
  originalPost?: {
    id: string
    version: number | null
    content?: string | null
    type?: string
  }
  author: {
    id: string
    name: string | null
    role: string
  }
  commentsCount: number
  unreadComments: number
  latestCommentAt: string | null
}

interface RecentComment {
  id: string
  content: string
  createdAt: string
  author: { id: string; name: string | null; role: string }
  post: {
    id: string
    version: number | null
    revisionNumber: number | null
    status: string
    originalPost?: { version: number | null } | null
  }
  postId?: string
}

export default function EditorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPostsListCollapsed, setIsPostsListCollapsed] = useState(false)
  const [filter, setFilter] = useState<'my-posts' | 'related' | 'all'>('my-posts')
  const [relatedPostIds, setRelatedPostIds] = useState<Set<string>>(new Set())
  const [relatedComments, setRelatedComments] = useState<RecentComment[]>([])
  const [comparisonStats, setComparisonStats] = useState<{
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  } | null>(null)
  // پیام قابل بررسی برای طرح‌های کاربر
  const [reviewableNoticePost, setReviewableNoticePost] = useState<Post | null>(null)

  // هندل بستن پیام و ذخیره در localStorage تا بعد از رفرش هم نمایش داده نشود
  const handleDismissReviewableNotice = useCallback(() => {
    if (!session || !reviewableNoticePost) return
    try {
      const key = `reviewableDismissed:${session.user?.id}`
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      const arr: string[] = raw ? JSON.parse(raw) : []
      if (!arr.includes(reviewableNoticePost.id)) {
        arr.push(reviewableNoticePost.id)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(arr))
        }
      }
    } catch {}
    setReviewableNoticePost(null)
  }, [session, reviewableNoticePost])

  // Parse diagram data for comparison
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

  const handleStatsChange = useCallback((stats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => {
    setComparisonStats(stats)
  }, [])

  // بررسی دسترسی
  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/auth/signin')
      return
    }

    // Previously restricted to EDITOR/ADMIN; now allow all authenticated users
  }, [session, status, router])

  // زمانی که لیست پست‌ها به‌روزرسانی شد، اگر طرح قابل بررسی مربوط به کاربر وجود داشت پیام را نشان بده
  useEffect(() => {
    if (!session) return
    try {
      const key = `reviewableDismissed:${session.user?.id}`
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      const dismissed: string[] = raw ? JSON.parse(raw) : []
      const dismissedSet = new Set(dismissed)
      const reviewable = posts.find(p => p.author.id === session.user?.id && p.status === 'REVIEWABLE' && !dismissedSet.has(p.id))
      setReviewableNoticePost(reviewable || null)
    } catch {
      const reviewable = posts.find(p => p.author.id === session.user?.id && p.status === 'REVIEWABLE')
      setReviewableNoticePost(reviewable || null)
    }
  }, [posts, session])

  // بارگذاری پست‌ها
  const loadPosts = async () => {
    try {
      const response = await fetch('/api/editor/posts', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setPosts(data)
      } else {
        toast.error('خطا در بارگذاری پست‌ها')
      }
    } catch (error) {
      console.error('Error loading posts:', error)
      toast.error('خطا در بارگذاری پست‌ها')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      loadPosts()
    }
  }, [session])

  // دریافت پست‌های دارای «کامنت‌های مربوط به من»
  const loadRelated = async () => {
    try {
      const res = await fetch('/api/editor/comments/related', { credentials: 'include' })
      if (res.ok) {
        const items: RecentComment[] = await res.json()
        setRelatedComments(items)
        const ids = new Set(items.map(i => i.postId || i.post.id))
        setRelatedPostIds(ids)
      }
    } catch (e) {
      console.error('Failed to load related comments', e)
    }
  }

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
      await loadPosts()
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
    if (filter === 'related') {
      loadRelated()
    }
  }, [filter])

  // Sync unread badge after comments read (مشابه ناظر)
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

  // فیلتر کردن پست‌ها
  const filteredPosts = posts.filter(post => {
    switch (filter) {
      case 'my-posts':
        return post.author.id === session?.user?.id
      case 'related':
        return relatedPostIds.has(post.id)
      case 'all':
        return true
      default:
        return true
    }
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // محاسبه میانگین امتیاز
  // const getAverageScore = (votes: Post['votes']) => {
  //   if (votes.length === 0) return 0
  //   const sum = votes.reduce((acc, vote) => acc + vote.score, 0)
  //   return (sum / votes.length).toFixed(1)
  // }

  // رنگ وضعیت
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-warm-cream text-gray-800'
    }
  }

  // فرمت تاریخ
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">در حال بارگذاری...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const myPostsCount = posts.filter(p => p.author.id === session.user?.id).length
  const relatedPostsCount = relatedPostIds.size
  const allPostsCount = posts.length

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-dark-text mb-8 text-center heading">
          داشبورد ویرایشگر
        </h1>

        {reviewableNoticePost && (
          <div role="alert" className="mb-6 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 p-4 dark:bg-yellow-950/40 dark:border-yellow-700 dark:text-yellow-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold mb-1">پیام مهم</div>
                <p className="text-sm leading-6">
                  طرح شماره {getPostDisplayId(reviewableNoticePost)} شما امتیاز گرفت اما ویرایش دیگری زودتر از ویرایش شما امتیاز گرفت و منتشر شد و طرح شما برچسب «قابل بررسی» خورده است. می‌توانید ایده‌های خود را بار دیگر روی طرحی که منتشر شده اعمال کنید و برای ما بفرستید.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={handleDismissReviewableNotice}
                  className="px-3 py-1.5 text-sm rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
                >
                  متوجه شدم
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Comparison Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

        <div className="flex gap-6">
          {/* Posts List (collapsible) */}
          <div className={`transition-all duration-300 ${isPostsListCollapsed ? 'w-12' : 'w-80 lg:w-96'}`}>
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
                {/* Filters */}
                <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setFilter('my-posts')}
                    aria-pressed={filter === 'my-posts'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'my-posts'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش طرح‌های من"
                  >
                    <span className={`${filter === 'my-posts' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{myPostsCount}</span>
                    <span className="whitespace-nowrap">طرح‌های من</span>
                  </button>

                  <button
                    onClick={() => setFilter('related')}
                    aria-pressed={filter === 'related'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'related'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش پست‌های دارای کامنت‌های مربوط به من"
                  >
                    <span className={`${filter === 'related' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{relatedPostsCount}</span>
                    <span className="whitespace-nowrap">کامنت‌های مربوط به من</span>
                  </button>
                  <button
                    onClick={() => setFilter('all')}
                    aria-pressed={filter === 'all'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'all'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-dark-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title="نمایش همه طرح‌ها"
                  >
                    <span className={`${filter === 'all' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{allPostsCount}</span>
                    <span className="whitespace-nowrap">همه طرح‌ها</span>
                  </button>
                </div>

                {filter === 'related' ? (
                  relatedComments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-dark-muted text-lg">هیچ کامنتی وجود ندارد</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {relatedComments.map((c) => (
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
                  filteredPosts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-dark-muted text-lg">هیچ طرحی یافت نشد</p>
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
                  )
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
                    نویسنده: {selectedPost.author.name || 'ناشناس'}
                  </p>

                  {/* Edit button for owner */}
                  {selectedPost.author.id === session.user?.id && (
                    <div className="mb-4">
                      <button
                        onClick={() => router.push(`/create?edit=${selectedPost.id}`)}
                        className="px-4 py-2 text-sm bg-warm-primary text-white rounded-lg hover:bg-warm-accent font-medium transition-all shadow-md hover:shadow-lg"
                      >
                        ویرایش
                      </button>
                    </div>
                  )}
                </div>

                {/* Diagram Comparison */}
                {selectedPost.type === 'TREE' && (
                  <div className="mb-6">
                    {selectedPost.originalPost && originalDiagramData && proposedDiagramData ? (
                      <div>
                        <h4 className="font-bold text-lg text-dark-text mb-4 heading">مقایسه نمودارها</h4>
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

                {/* Comments */}
                <div id="comments">
                  <CommentSection postId={selectedPost.id} />
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="text-center text-gray-400 py-12">
                  لطفاً یک پست را از لیست انتخاب کنید
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}