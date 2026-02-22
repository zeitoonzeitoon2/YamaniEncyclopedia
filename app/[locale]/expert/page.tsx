'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/lib/navigation'
import CommentSection from '@/components/CommentSection'
import DiagramComparison from '@/components/DiagramComparison'
import EnhancedDiagramComparison from '@/components/EnhancedDiagramComparison'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import VotingSlider from '@/components/VotingSlider'
import { SimplePostCard } from '@/components/SimplePostCard'
import toast from 'react-hot-toast'
import { getPostDisplayId } from '@/lib/postDisplay'
import { useLocale, useTranslations } from 'next-intl'

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
  changeReason?: {
    type: string
    summary: string
    evidence: string
    rebuttal: string
  } | null
  changeSummary?: string | null
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

export default function ExpertDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('expert')
  const tArg = useTranslations('argumentation')
  const tPost = useTranslations('postCard')
  const locale = useLocale()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(5)
  const [hasNext, setHasNext] = useState(false)
  const [filter, setFilter] = useState<'new_designs' | 'new_comments' | 'reviewables' | 'my-posts' | 'related' | 'user-search' | 'researchers'>('new_designs')
  const [userQuery, setUserQuery] = useState('')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [isDomainExpert, setIsDomainExpert] = useState(false)
  const isExpertRole = session?.user?.role === 'EXPERT' || session?.user?.role === 'ADMIN'
  const isVoter = isExpertRole || isDomainExpert
  const isEditor = !isVoter && (session?.user?.role === 'EDITOR' || session?.user?.role === 'USER')
  
  console.log('ExpertDashboard render - posts:', posts.length, 'selectedPost:', selectedPost?.id)
  
  // Debug: Add visual indicator
  useEffect(() => {
    console.log('ExpertDashboard mounted, posts:', posts.length)
  }, [posts])

  useEffect(() => {
    if (status !== 'authenticated') return
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setIsDomainExpert(!!data?.isDomainExpert)
        } else {
          setIsDomainExpert(false)
        }
      } catch {
        setIsDomainExpert(false)
      }
    })()
  }, [status])
  const [isPostsListCollapsed, setIsPostsListCollapsed] = useState(false)
  const [adminStats, setAdminStats] = useState<{expertCount: number; adminCount: number; combinedCount: number; threshold: number; participationThreshold: number} | null>(null)
  const [currentUserVote, setCurrentUserVote] = useState<number | undefined>(undefined)
  const [comparisonStats, setComparisonStats] = useState<{
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  } | null>(null)
  const [recentComments, setRecentComments] = useState<RecentComment[]>([])
  const [relatedComments, setRelatedComments] = useState<RecentComment[]>([])
  const [relatedPostIds, setRelatedPostIds] = useState<Set<string>>(new Set())
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [reviewableNoticePost, setReviewableNoticePost] = useState<Post | null>(null)
  const [researchers, setResearchers] = useState<Array<{ id: string; name: string | null; role: string; image: string | null }>>([])
  const [allResearchers, setAllResearchers] = useState<Array<{ id: string; name: string | null; role: string; image: string | null }>>([])
  const [researcherQuery, setResearcherQuery] = useState('')
  const [isResearchersLoading, setIsResearchersLoading] = useState(false)
  const [selectedResearcherId, setSelectedResearcherId] = useState<string | null>(null)
  const [selectedResearcher, setSelectedResearcher] = useState<{ id: string; name: string | null; role: string; image: string | null; bio: string | null } | null>(null)
  const [researcherPosts, setResearcherPosts] = useState<Post[]>([])
  const [isResearcherDetailLoading, setIsResearcherDetailLoading] = useState(false)

  const fetchResearcherDetail = useCallback(async (id: string) => {
    try {
      setIsResearcherDetailLoading(true)
      const res = await fetch(`/api/researchers/${id}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setSelectedResearcher(data)
      }
    } finally {
      setIsResearcherDetailLoading(false)
    }
  }, [])

  const pickUserAndShowPosts = useCallback((id: string) => {
    setSelectedResearcherId(id)
    setFilter('researchers')
    setPage(1)
    setPosts([])
    fetchResearcherDetail(id)
  }, [fetchResearcherDetail])
  
  const expertParticipation = useMemo(() => {
    if (!selectedPost?.votes) return 0
    return selectedPost.votes.filter(v => {
      const role = (v as any)?.admin?.role
      return role === 'EXPERT' || role === 'ADMIN'
    }).length
  }, [selectedPost])

  const getRoleLabel = (role: string) => {
    if (role === 'EXPERT') return t('roles.expert')
    if (role === 'EDITOR') return t('roles.editor')
    if (role === 'ADMIN') return t('roles.admin')
    if (role === 'USER') return t('roles.user')
    return role
  }
  
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

  const fetchRelatedComments = useCallback(async () => {
    try {
      const res = await fetch('/api/expert/comments/related', { credentials: 'include' })
      if (res.ok) {
        const data: RecentComment[] = await res.json()
        setRelatedComments(data)
        const ids = new Set(data.map(i => (i as any).postId || i.post.id))
        setRelatedPostIds(ids)
      } else {
        console.error('Failed to fetch related comments: ', await res.text())
      }
    } catch (e) {
      console.error('Failed to fetch related comments', e)
    }
  }, [])

  const fetchResearchers = useCallback(async (q?: string) => {
    try {
      setIsResearchersLoading(true)
      const url = new URL('/api/researchers', typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      if (q && q.trim()) url.searchParams.set('q', q.trim())
      const res = await fetch(url.toString(), { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setResearchers(Array.isArray(data) ? data : [])
      } else {
        console.error('Failed to fetch researchers:', await res.text())
      }
    } catch (e) {
      console.error('Failed to fetch researchers', e)
    } finally {
      setIsResearchersLoading(false)
    }
  }, [])

  const fetchAllResearchers = useCallback(async () => {
    try {
      setIsResearchersLoading(true)
      const res = await fetch('/api/researchers', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setAllResearchers(Array.isArray(data) ? data : [])
      }
    } finally {
      setIsResearchersLoading(false)
    }
  }, [])


  const fetchResearcherPosts = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/researchers/${id}/posts?page=${page}&pageSize=${pageSize}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? data.items : []
        setPosts(prev => page === 1 ? (items as any) : ([...prev, ...items] as any))
        setHasNext(page < (data?.totalPages || 1))
      }
    } catch {}
  }, [page, pageSize])

  useEffect(() => {
    if (filter === 'related') {
      fetchRelatedComments()
    }
  }, [filter, fetchRelatedComments])

  useEffect(() => {
    if (filter === 'researchers') {
      // Always have full list ready as fallback
      fetchAllResearchers()
    }
  }, [filter, fetchAllResearchers])

  useEffect(() => {
    if (filter === 'researchers') {
      const q = researcherQuery.trim()
      if (q) fetchResearchers(q)
      else setResearchers([]) // clear query results to rely on full list
    }
  }, [filter, researcherQuery, fetchResearchers])

  useEffect(() => {
    if (!session) return
    try {
      const key = `reviewableDismissed:${session.user?.id}`
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      const dismissed: string[] = raw ? JSON.parse(raw) : []
      const dismissedSet = new Set(dismissed)
      const reviewable = posts.find(
        p => p.author.id === session.user?.id && p.status === 'REVIEWABLE' && !dismissedSet.has(p.id)
      )
      setReviewableNoticePost(reviewable || null)
    } catch {
      const reviewable = posts.find(p => p.author.id === session.user?.id && p.status === 'REVIEWABLE')
      setReviewableNoticePost(reviewable || null)
    }
  }, [posts, session])

  const fetchPostDetails = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/expert/posts/${postId}`, { credentials: 'include' })
      if (!res.ok) {
        console.error('Failed to fetch post details:', res.status, await res.text())
        toast.error(t('toast.loadError'))
        return null
      }
      const post = await res.json()
      // Update selectedPost and update item in list
      setSelectedPost(post)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...post } : p))
      return post
    } catch (e) {
      console.error('Failed to fetch post details', e)
      toast.error(t('toast.loadError'))
      return null
    }
  }, [t])

  const fetchPosts = useCallback(async (signal?: AbortSignal, append: boolean = false) => {
    try {
      if (filter === 'researchers' && selectedResearcherId) {
        const url = new URL(`/api/researchers/${selectedResearcherId}/posts`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
        url.searchParams.set('page', String(page))
        url.searchParams.set('pageSize', String(pageSize))
        const resp = await fetch(url.toString(), { credentials: 'include', signal })
        if (resp.ok) {
          const data = await resp.json()
          const items = Array.isArray(data?.items) ? data.items : []
          setPosts(prev => append ? [...prev, ...items] : items)
          const totalPages = Number(data?.totalPages || 1)
          setHasNext(page < totalPages)
        } else {
          toast.error(t('toast.loadError'))
        }
      } else {
        const url = new URL('/api/expert/posts', typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
        url.searchParams.set('page', String(page))
        url.searchParams.set('pageSize', String(pageSize))
        if (filter === 'user-search' && userQuery.trim()) {
          url.searchParams.set('authorQuery', userQuery.trim())
        }
        const postsResponse = await fetch(url.toString(), { credentials: 'include', signal })
        if (postsResponse.ok) {
          const data = await postsResponse.json()
          const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
          setPosts(prev => append ? [...prev, ...items] : items)
          setHasNext(!!data?.hasNext)
        } else {
          toast.error(t('toast.loadError'))
        }
      }

      // Get expert stats for the expert only
      if (isExpertRole) {
        const statsResponse = await fetch('/api/expert/stats', { credentials: 'include' })
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setAdminStats(statsData)
        }
      }
    } catch (error) {
      toast.error(t('toast.loadError'))
    } finally {
      setLoading(false)
    }
  }, [filter, selectedResearcherId, page, pageSize, userQuery, isExpertRole, t])

  const openPostById = useCallback(async (postId: string) => {
    const found = posts.find(p => p.id === postId)
    if (found) {
      // If content is not in list, load details lazily
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
            // Same lazy check after refreshing list
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
  }, [posts, fetchPostDetails, fetchPosts])

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

    // Allow any logged-in user to enter; visibility inside page is role-based

    console.log('Calling fetchPosts')
    fetchPosts()
  }, [session, status, router, fetchPosts])

  // Reset menu badge to zero when reading CommentSection
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

  // Get current user's vote for the selected post
  useEffect(() => {
    if (selectedPost && session?.user) {
      const userVote = selectedPost.votes?.find(vote => vote.adminId === session.user.id)
      setCurrentUserVote(userVote?.score)
    } else {
      setCurrentUserVote(undefined)
    }
  }, [selectedPost, session?.user])

  const handleDeletePost = useCallback((postId: string) => {
    setDeleteTargetId(postId)
    setDeleteModalOpen(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId) return
    try {
      const res = await fetch(`/api/posts/${deleteTargetId}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        toast.success(t('toast.deleteSuccess'))
        setDeleteModalOpen(false)
        setSelectedPost(null)
        const ac = new AbortController()
        setPage(1)
        setTimeout(() => fetchPosts(ac.signal, false), 0)
      } else {
        const data = await res.json().catch(() => ({} as any))
        toast.error(data?.error || t('toast.deleteFail'))
      }
    } catch (e) {
      console.error('Delete post error:', e)
      toast.error(t('toast.deleteError'))
    }
  }, [deleteTargetId, fetchPosts, t])

  const confirmWithdrawEdit = useCallback(async () => {
    if (!deleteTargetId) return
    try {
      const res = await fetch(`/api/posts/${deleteTargetId}/withdraw`, { method: 'POST', credentials: 'include' })
      if (res.ok) {
        toast.success(t('toast.withdrawSuccess'))
        setDeleteModalOpen(false)
        setSelectedPost(null)
        router.push(`/create?edit=${deleteTargetId}`)
      } else {
        const data = await res.json().catch(() => ({} as any))
        toast.error(data?.error || t('toast.withdrawFail'))
      }
    } catch (e) {
      console.error('Withdraw post error:', e)
      toast.error(t('toast.withdrawError'))
    }
  }, [deleteTargetId, router, t])

  useEffect(() => {
    if (status === 'authenticated') {
      const ac = new AbortController()
      setPage(1)
      setPosts([])
      fetchPosts(ac.signal, false)
      return () => ac.abort()
    }
  }, [status, pageSize, filter, fetchPosts])

  useEffect(() => {
    if (status === 'authenticated' && (filter === 'researchers' || filter === 'user-search') && (selectedResearcherId || userQuery.trim())) {
      const ac = new AbortController()
      setPage(1)
      setPosts([])
      fetchPosts(ac.signal, false)
      return () => ac.abort()
    }
  }, [status, filter, selectedResearcherId, userQuery, fetchPosts])



  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center">
        <div className="text-site-text">{t('loading')}</div>
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
      case 'my-posts':
        return post.author.id === session?.user?.id
      default:
        return true
    }
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const newDesignsCount = posts.length
  const totalUnreadComments = posts.reduce((sum, p) => sum + (p.unreadComments || 0), 0)
  const reviewablesCount = posts.filter(p => p.status === 'REVIEWABLE').length
  const myPostsCount = posts.filter(p => p.author.id === session?.user?.id).length
  const relatedCount = relatedPostIds.size
  const pendingCount = posts.filter(p => p.status === 'PENDING').length
  const approvedCount = posts.filter(p => p.status === 'APPROVED').length
  const rejectedCount = posts.filter(p => p.status === 'REJECTED').length

  const handleVote = async (postId: string, score: number) => {
    try {
      const response = await fetch('/api/expert/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, score }),
      })

      if (response.ok) {
        toast.success(t('toast.voteSuccess'))
        setCurrentUserVote(score)
        
        // Check for automatic publishing
        const autoPublishResponse = await fetch('/api/expert/auto-publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ postId }),
        })

        if (autoPublishResponse.ok) {
          const result = await autoPublishResponse.json()
          if (result.published) {
            toast.success(t('toast.autoPublish', { action: result.action === 'approved' ? t('autoPublish.approved') : t('autoPublish.rejected') }))
          }
        }

        // Update posts list
        await fetchPosts()
        
        // Update selectedPost with new data from updated list
        if (selectedPost) {
          // Find updated post in the new list
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
        toast.error(errorData.error || t('toast.voteFail'))
      }
    } catch (error) {
      console.error('Vote error:', error)
      toast.error(t('toast.voteFail'))
    }
  }

  return (
    <div className="min-h-screen bg-site-bg flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 relative z-0">
        <h1 className="text-3xl font-bold text-site-text mb-8 text-center heading">
          {isEditor ? t('title.editor') : t('title.expert')}
        </h1>

        {reviewableNoticePost && (
          <div role="alert" className="mb-6 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 p-4 dark:bg-yellow-950/40 dark:border-yellow-700 dark:text-yellow-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold mb-1">{t('alert.title')}</div>
                <p className="text-sm leading-6">
                  {t('alert.text', { id: getPostDisplayId(reviewableNoticePost, tPost) })}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={handleDismissReviewableNotice}
                  className="px-3 py-1.5 text-sm rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 transition-colors"
                >
                  {t('alert.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Comparison Stats - showing analytical stats for the last selected post card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Nodes card */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-site-text heading">{t('stats.nodes')}</h3>
            <div className="flex justify-around mt-3">
              <div className="text-center">
                <p className="text-xl font-bold text-green-400">{comparisonStats?.nodes.added || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.added')}</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-400">{comparisonStats?.nodes.removed || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.removed')}</p>
              </div>
            </div>
          </div>

          {/* Flashcards card */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-site-text heading">{t('stats.flashcards')}</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.flashcards.added || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.added')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.flashcards.removed || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.removed')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.flashcards.edited || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.edited')}</p>
              </div>
            </div>
          </div>

          {/* Articles card */}
           <div className="card text-center">
             <h3 className="text-lg font-semibold text-site-text heading">{t('stats.articles')}</h3>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{comparisonStats?.articles.added || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.added')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{comparisonStats?.articles.removed || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.removed')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-yellow-400">{comparisonStats?.articles.edited || 0}</p>
                <p className="text-xs text-site-muted">{t('stats.edited')}</p>
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
                <h2 className="text-xl font-bold text-site-text heading">{t('postsList.title')}</h2>
              )}
              <button
                onClick={() => setIsPostsListCollapsed(!isPostsListCollapsed)}
                className="p-2 rounded-lg bg-site-card text-site-text hover:bg-gray-700 transition-colors"
                title={isPostsListCollapsed ? t('postsList.show') : t('postsList.hide')}
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
                    onClick={() => openPostById(post.id)}  // Change: instead of setSelectedPost(post)
                    title={t('postIdTitle', { id: getPostDisplayId(post, tPost) })}
                  >
                    {getPostDisplayId(post, tPost).charAt(0)}
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
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.newDesignsTitle')}
                  >
                    <span className={`${filter === 'new_designs' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{newDesignsCount}</span>
                    <span className="whitespace-nowrap">{t('filters.newDesigns')}</span>
                  </button>

                  <button
                    onClick={() => setFilter('new_comments')}
                    aria-pressed={filter === 'new_comments'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'new_comments'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.newCommentsTitle')}
                  >
                    <span className={`${filter === 'new_comments' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{totalUnreadComments}</span>
                    <span className="whitespace-nowrap">{t('filters.newComments')}</span>
                  </button>

                  <button
                    onClick={() => setFilter('reviewables')}
                    aria-pressed={filter === 'reviewables'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'reviewables'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.reviewablesTitle')}
                  >
                    <span className={`${filter === 'reviewables' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{reviewablesCount}</span>
                    <span className="whitespace-nowrap">{t('filters.reviewables')}</span>
                  </button>
                </div>
                <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setFilter('my-posts')}
                    aria-pressed={filter === 'my-posts'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'my-posts'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.myPostsTitle')}
                  >
                    <span className={`${filter === 'my-posts' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{myPostsCount}</span>
                    <span className="whitespace-nowrap">{t('filters.myPosts')}</span>
                  </button>

                  <button
                    onClick={() => setFilter('related')}
                    aria-pressed={filter === 'related'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'related'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.relatedTitle')}
                  >
                    <span className={`${filter === 'related' ? 'bg-black/20 text-black border-black/20' : 'bg-gray-800 text-gray-200 border-gray-600'} inline-flex items-center justify-center rounded-full border w-6 h-6 text-[10px] font-bold`}>{relatedCount}</span>
                    <span className="whitespace-nowrap">{t('filters.related')}</span>
                  </button>

                  <button
                    onClick={() => setFilter('researchers')}
                    aria-pressed={filter === 'researchers'}
                    className={`group relative w-full rounded-full border text-xs font-medium py-2 px-3 flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-primary ${
                      filter === 'researchers'
                        ? 'bg-warm-primary text-black border-warm-primary shadow'
                        : 'bg-transparent text-site-text border-gray-700 hover:bg-gray-800/60'
                    }`}
                    title={t('filters.researchersTitle')}
                  >
                    <span className="whitespace-nowrap">{t('filters.researchers')}</span>
                  </button>
                </div>

                {filter === 'researchers' && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        value={researcherQuery}
                        onChange={(e) => setResearcherQuery(e.target.value)}
                        className="w-full rounded-full border text-xs py-2 px-3 bg-site-card text-site-text border-gray-700"
                        placeholder={t('researcherSearch.placeholder')}
                        title={t('researcherSearch.title')}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto bg-site-card border border-gray-700 rounded-lg p-2">
                      {isResearchersLoading ? (
                        <div className="text-site-muted text-sm">{t('loading')}</div>
                      ) : researchers.length === 0 ? (
                        <div className="text-site-muted text-sm">{t('researcherSearch.noResults')}</div>
                      ) : (
                        <div className="space-y-1">
                          {(researchers.length ? researchers : allResearchers).map(r => (
                            <button
                              key={r.id}
                              onClick={() => { setSelectedResearcherId(r.id); fetchResearcherDetail(r.id); fetchResearcherPosts(r.id) }}
                              className="w-full text-right px-3 py-1 rounded hover:bg-gray-800/60 text-sm text-site-text flex items-center gap-2"
                              title={t('researcherSearch.viewResearcher')}
                            >
                              {r.image ? (
                                <Image src={r.image} alt={r.name || ''} width={24} height={24} className="rounded-full" />
                              ) : (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-xs">{(r.name||'?').charAt(0)}</span>
                              )}
                              <span className="flex-1">
                                {(r.name && !r.name.includes('@')) ? r.name : t('researcher.noName')}
                                <span className="ml-2 text-xs text-site-muted">{getRoleLabel(r.role)}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedResearcherId && selectedResearcher && (
                      <div className="mt-3 space-y-3">
                        <div className="card p-3">
                          <div className="flex items-center gap-3">
                            {selectedResearcher.image ? (
                              <Image src={selectedResearcher.image} alt={selectedResearcher.name || ''} width={48} height={48} className="rounded-full" />
                            ) : (
                              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-700 text-white text-sm">{(selectedResearcher.name||'?').charAt(0)}</span>
                            )}
                            <div>
                              <div className="text-site-text font-semibold">
                                {selectedResearcher.name || t('researcher.noName')}
                              </div>
                              <div className="text-xs text-site-muted">{getRoleLabel(selectedResearcher.role)}</div>
                            </div>
                          </div>
                          {selectedResearcher.bio && (
                            <div className="mt-2 text-sm text-site-text leading-6">{selectedResearcher.bio}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filter === 'new_comments' ? (
                  recentComments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-site-muted text-lg">{t('emptyComments')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {recentComments.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => openPostById(c.post.id)}
                          className="w-full text-right bg-site-card hover:bg-gray-800/60 transition-colors rounded-lg p-3 border border-gray-700"
                          title={t('comment.openRelated')}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="inline-flex items-center gap-1 text-xs text-site-muted">
                              <span className="px-2 py-0.5 rounded-full border border-gray-600 bg-gray-800 text-gray-200">
                                {getPostDisplayId({ id: c.post.id, version: c.post.version ?? null, revisionNumber: c.post.revisionNumber ?? null, status: c.post.status, originalPost: c.post.originalPost ?? null }, tPost)}
                              </span>
                              <span className="truncate">{c.author.name || t('author.unknown')} • {new Date(c.createdAt).toLocaleDateString('en-GB')}</span>
                            </span>
                          </div>
                          <div className="text-sm text-site-text line-clamp-2">
                            {c.content}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : filter === 'related' ? (
                  relatedComments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-site-muted text-lg">{t('emptyComments')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {relatedComments.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => openPostById(c.post.id)}
                          className="w-full text-right bg-site-card hover:bg-gray-800/60 transition-colors rounded-lg p-3 border border-gray-700"
                          title={t('comment.openRelatedPost')}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="inline-flex items-center gap-1 text-xs text-site-muted">
                              <span className="px-2 py-0.5 rounded-full border border-gray-600 bg-gray-800 text-gray-200">
                                {getPostDisplayId({ id: c.post.id, version: c.post.version ?? null, revisionNumber: c.post.revisionNumber ?? null, status: c.post.status, originalPost: c.post.originalPost ?? null }, tPost)}
                              </span>
                              <span className="truncate">{c.author.name || t('author.unknown')} • {new Date(c.createdAt).toLocaleDateString('en-GB')}</span>
                            </span>
                          </div>
                          <div className="text-sm text-site-text line-clamp-2">
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
                        <p className="text-site-muted text-lg">
                          {t('emptyDesigns')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {filteredPosts.slice(0, filteredPosts.length).map((post) => (
                        <div key={post.id} className={`${selectedPost?.id === post.id ? 'ring-2 ring-warm-primary rounded-xl' : ''}`}>
                          <SimplePostCard
                            post={{ ...post, createdAt: new Date(post.createdAt) } as any}
                            isSelected={selectedPost?.id === post.id}
                            onClick={() => openPostById(post.id)}  // Change: instead of setSelectedPost(post)
                          />
                        </div>
                      ))}
                      {hasNext && (
                        <div className="flex justify-center pt-2">
                          <button
                            onClick={() => {
                              const ac = new AbortController()
                              setPage(p => p + 1)
                              setTimeout(() => fetchPosts(ac.signal, true), 0)
                            }}
                            className="px-4 py-2 rounded bg-site-card text-site-text border border-site-border hover:bg-gray-800/60"
                          >
                            {t('showMore')}
                          </button>
                        </div>
                      )}
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
                <h2 className="text-xl font-bold text-site-text mb-4 heading">{t('details.title')}</h2>
                <div className="card mb-6 relative">
                  <h3 className="font-bold text-lg text-site-text mb-2 heading">{t('details.postId', { id: getPostDisplayId(selectedPost, tPost) })}</h3>
                  <p className="text-site-muted text-sm mb-4">
                    {t('details.authorLabel')}
                    <button
                      type="button"
                      onClick={() => pickUserAndShowPosts(selectedPost.author.id)}
                      className="ml-1 text-site-text hover:underline"
                      title={t('details.viewAuthorPosts')}
                    >
                      {selectedPost.author.name || t('author.unknown')}
                    </button>
                    <span className="ml-1">({getRoleLabel(selectedPost.author.role)})</span>
                  </p>
                  {selectedPost.author.id === session?.user?.id && selectedPost.status === 'PENDING' && (
                    <button
                      onClick={() => handleDeletePost(selectedPost.id)}
                      className="absolute top-3 left-3 z-10 px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md"
                      title={t('details.deleteBeforeThreshold')}
                    >
                      {t('details.delete')}
                    </button>
                  )}
                  
                  {isVoter && (
                    <div className="mb-4">
                      {selectedPost.status === 'APPROVED' ? (
                        <div className="p-3 rounded-lg border border-green-200 bg-green-100 text-green-800 text-sm dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">
                          {t('details.voteStopped')}
                        </div>
                      ) : (
                        <VotingSlider
                          currentVote={currentUserVote}
                          onVote={(score) => handleVote(selectedPost.id, score)}
                          disabled={['REJECTED','ARCHIVED'].includes(selectedPost.status)}
                        />
                      )}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center text-sm text-site-muted">
                    {isExpertRole && adminStats ? (
                      <div className="flex items-center gap-4">
                        <span>{t('details.scoreThreshold', { value: adminStats.threshold })}</span>
                        <span>{t('details.participationThreshold', { value: adminStats.participationThreshold })}</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-4">
                      <span>
                        {t('details.totalScoreLabel')} <span className={`font-bold ${
                          (selectedPost.totalScore || 0) > 0 ? 'text-green-600' : 
                          (selectedPost.totalScore || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {selectedPost.totalScore || 0}
                        </span>
                      </span>
                      <span>{t('details.participantsLabel', { value: expertParticipation })}</span>
                    </div>
                  </div>
                </div>

                {/* Diagram Comparison */}
                {selectedPost.type === 'TREE' && (
                  <div className="mb-6">
                    {/* Reasoning Card */}
                    {selectedPost.changeReason && (
                      <div className="mb-6 p-4 rounded-xl border border-warm-primary/20 bg-warm-primary/5 text-site-text shadow-sm backdrop-blur-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-warm-primary/10 pb-3 gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-warm-primary/10 rounded-lg text-warm-accent">
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                            </div>
                            <h4 className="font-bold text-base heading m-0 text-warm-accent">{tArg('title')}</h4>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Right Side: Summary (1/3) */}
                          <div className="md:col-span-1 space-y-3 order-1 md:order-1">
                            <div className="bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 h-full">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('summaryLabel')}</div>
                              <div className="text-sm whitespace-pre-wrap leading-relaxed text-site-text">
                                {selectedPost.changeReason.summary}
                              </div>
                            </div>
                          </div>

                          {/* Left Side: Evidence (2/3) */}
                          <div className="md:col-span-2 space-y-3 order-2 md:order-2">
                            <div className="bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 h-full">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('evidenceLabel')}</div>
                              <div className="text-sm whitespace-pre-wrap leading-relaxed text-site-text">
                                {selectedPost.changeReason.evidence}
                              </div>
                            </div>
                          </div>

                          {/* Rebuttal: Full width if exists and not empty */}
                          {selectedPost.changeReason.rebuttal && selectedPost.changeReason.rebuttal.trim().length > 0 && (
                            <div className="md:col-span-3 bg-site-bg/40 p-3 rounded-lg border border-warm-primary/10 order-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-site-muted mb-2">{tArg('rebuttalLabel')}</div>
                              <div className="text-sm whitespace-pre-wrap italic text-site-text/90">
                                {selectedPost.changeReason.rebuttal}
                              </div>
                            </div>
                          )}

                          {/* Change Type: Only if not empty */}
                          {selectedPost.changeReason.type && selectedPost.changeReason.type.trim().length > 0 && (
                            <div className="md:col-span-3 bg-site-bg/40 p-2 rounded-lg border border-warm-primary/10 order-4 flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-site-muted">{tArg('typeLabel')}:</span>
                              <span className="text-xs font-medium text-warm-primary px-2 py-0.5 bg-warm-primary/10 rounded-full">
                                {tArg(`types.${selectedPost.changeReason.type}`)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedPost.originalPost ? (
                      <div>
                        {/* Fallback to simple summary if no structured reason exists */}
                        {!selectedPost.changeReason && (selectedPost.changeSummary || proposedDiagramData?.changeSummary) && (
                          <div className="mb-4 p-4 rounded-lg border border-blue-200 bg-blue-100 text-blue-800 text-sm dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700">
                            <div className="font-semibold mb-1 heading">{t('diagram.changeSummary')}</div>
                            <div className="whitespace-pre-wrap break-words">{selectedPost.changeSummary || proposedDiagramData.changeSummary}</div>
                          </div>
                        )}
                        <h4 className="font-bold text-lg text-site-text mb-4 heading">{t('diagram.proposed')}</h4>
                        {originalDiagramData && proposedDiagramData ? (
                          <>
                            {/* Legend: Color Guide */}
                            <div className="mb-4">
                              <div className="bg-site-card border border-gray-700 rounded-lg p-5 text-sm text-site-text">
                                <div className="font-semibold mb-2 heading">{t('legend.title')}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Nodes legend */}
                                  <div>
                                    <div className="text-xs text-site-muted mb-1">{t('legend.nodes')}</div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 text-xs">{t('legend.nodeNew')}</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800 text-xs">{t('legend.nodeRemoved')}</span>
                                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">{t('legend.nodeRenamed')}</span>
                                    </div>
                                  </div>
                                  {/* Stroke legend */}
                                  <div>
                                    <div className="text-xs text-site-muted mb-1">{t('legend.flashcards')}</div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-green-500 bg-transparent" />
                                        {t('legend.flashcardNew')}
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-red-500 bg-transparent" />
                                        {t('legend.flashcardRemoved')}
                                      </span>
                                      <span className="inline-flex items-center gap-2 text-xs">
                                        <span className="inline-block w-4 h-4 rounded border-4 border-blue-500 bg-transparent" />
                                        {t('legend.flashcardEdited')}
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
                            {t('diagram.invalidData')}
          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-bold text-lg text-site-text mb-4 heading">{t('diagram.proposed')}</h4>
                        {proposedDiagramData ? (
                          <div className="h-96 border border-gray-300 rounded-lg overflow-hidden">
                            <TreeDiagramEditor
                              initialData={proposedDiagramData}
                              readOnly={true}
                            />
                          </div>
                        ) : (
                          <div className="text-red-400 text-center py-4">
                            {t('diagram.invalidData')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Comments Section */}
                <div id="comments">
                  <CommentSection postId={selectedPost.id} onPickUser={pickUserAndShowPosts} />
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-site-muted text-lg">
                  {t('details.empty')}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-site-text heading">{t('actions.title')}</h2>
              <p className="text-sm text-site-text mt-1">{t('actions.question')}</p>
              <p className="text-sm text-site-text mt-2">{t('actions.note')}</p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setDeleteModalOpen(false)} className="btn-secondary">{t('actions.cancel')}</button>
                <button type="button" onClick={confirmWithdrawEdit} className="btn-primary">{t('actions.edit')}</button>
                <button type="button" onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md">{t('actions.delete')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
