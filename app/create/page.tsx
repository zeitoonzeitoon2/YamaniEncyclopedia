'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import toast from 'react-hot-toast'
import { Node, Edge } from 'reactflow'

export default function CreatePost() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [originalPostId, setOriginalPostId] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [
      {
        id: '1',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: 'شروع' },
      },
    ],
    edges: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const DRAFT_KEY = 'create_tree_draft_v1'

  // Guard to temporarily disable autosave (e.g., right after successful submit)
  const skipAutoSaveRef = useRef(false)

  // Helper: determine if a draft is trivial (only start node, no edges)
  const isTrivialTree = (data?: { nodes: Node[]; edges: Edge[] } | null) => {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return true
    const { nodes, edges } = data
    return (edges.length === 0 && nodes.length <= 1)
  }

  // بارگذاری نمودار اصلی با بیشترین امتیاز یا بازیابی پیش‌نویس ذخیره‌شده
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (status !== 'authenticated') {
      setIsLoading(false)
      return
    }
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    // تلاش برای بازیابی پیش‌نویس از localStorage
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.treeData?.nodes && parsed?.treeData?.edges) {
          // فقط اگر پیش‌نویس واقعی باشد (بیش از یک نود یا دارای یال)
          if (!isTrivialTree(parsed.treeData)) {
            setTreeData(parsed.treeData)
            setOriginalPostId(parsed.originalPostId ?? null)
            setIsLoading(false)
            return
          } else {
            // اگر پیش‌نویس صرفاً «نود شروع» است، آن را نادیده بگیریم تا نمودار اصلی بارگذاری شود
            // و همان‌جا نیز پاکش کنیم تا مزاحم دفعات بعدی نشود
            try { localStorage.removeItem(DRAFT_KEY) } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore draft from localStorage', e)
    }

    const loadTopPost = async () => {
      try {
        const response = await fetch('/api/posts/top')
        if (response.ok) {
          const topPost = await response.json()
          if (topPost) {
            setOriginalPostId(topPost.id)
            const parsedContent = JSON.parse(topPost.content)
            setTreeData(parsedContent)
          }
        }
      } catch (error) {
        console.error('خطا در بارگذاری نمودار اصلی:', error)
        toast.error('خطا در بارگذاری نمودار اصلی')
      } finally {
        setIsLoading(false)
      }
    }

    loadTopPost()
  }, [status])

  // ذخیره خودکار پیش‌نویس در localStorage با هر تغییر
  useEffect(() => {
    if (status !== 'authenticated') return
    if (skipAutoSaveRef.current) return
    // از ذخیره‌ی پیش‌نویس کاملاً خالی (فقط نود شروع) جلوگیری کنیم
    if (isTrivialTree(treeData)) return
    try {
      const payload = { treeData, originalPostId }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
    } catch (e) {
      console.warn('Failed to persist draft into localStorage', e)
    }
  }, [treeData, originalPostId, status])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">در حال بارگذاری...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">لطفاً وارد شوید</div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (treeData.nodes.length === 0) {
      toast.error('لطفاً حداقل یک نود در نمودار ایجاد کنید')
      return
    }

    setIsSubmitting(true)

    try {
      // ارسال صرفاً محتوای نمودار؛ مقالات از طریق API همان لحظه ایجاد می‌شوند
      const body: any = {
        content: JSON.stringify(treeData),
        type: 'TREE',
      }
      if (originalPostId) body.originalPostId = originalPostId

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        toast.success('نمودار شما با موفقیت ارسال شد و در انتظار تایید است')

        // پاک کردن پیش‌نویس ذخیره شده پس از ارسال موفق و جلوگیری از ذخیره مجدد حالت پیش‌فرض
        skipAutoSaveRef.current = true
        try { localStorage.removeItem(DRAFT_KEY) } catch {}

        setTreeData({
          nodes: [
            {
              id: '1',
              type: 'custom',
              position: { x: 400, y: 200 },
              data: { label: 'شروع' },
            },
          ],
          edges: [],
        })
        router.push('/')
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('ارسال نمودار ناموفق:', err)
        toast.error('خطا در ارسال نمودار')
      }
    } catch (error) {
      console.error('خطا در ارسال نمودار:', error)
      toast.error('خطا در ارسال نمودار')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      
      <main className="px-4 py-8">
        <div className="max-w-none">
          <h1 className="text-3xl font-bold text-dark-text mb-8 text-center">
            {originalPostId ? 'ویرایش نمودار اصلی' : 'ایجاد نمودار درختی جدید'}
          </h1>

          {/* نوار اقدامات بالا */}
          <div className="flex gap-4 mb-4 justify-end">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="btn-secondary"
            >
              انصراف
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e as any)}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'در حال ارسال...' : (originalPostId ? 'ارسال تغییرات' : 'ارسال نمودار')}
            </button>
          </div>

          <div className="card">
            <div className="mb-6">
              <label className="block text-dark-text font-medium mb-2">
                نمودار درختی
              </label>
              <div className="text-sm text-gray-400 mb-4">
                {originalPostId 
                  ? 'نمودار اصلی بارگذاری شده است. می‌توانید نودهای جدید اضافه کنید، موجودی‌ها را ویرایش یا حذف کنید.'
                  : 'برای ایجاد نمودار، نودهای جدید اضافه کنید و آنها را به هم متصل کنید. برای اتصال دو نود، از دایره‌های کناری نودها استفاده کنید.'
                }
              </div>
              <div className="w-full min-h-[150vh]">
                <TreeDiagramEditor
                  initialData={treeData}
                  onDataChange={setTreeData}
                  height="150vh"
                  collectDrafts={false}
                  isCreatePage={true}
                />
              </div>
            </div>

            {/* دکمه‌های پایین حذف شدند و به بالا منتقل شدند */}
          </div>
        </div>
      </main>
    </div>
  )
}