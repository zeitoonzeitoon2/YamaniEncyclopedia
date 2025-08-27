'use client'

import { useState, useEffect, useRef } from 'react'
import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import TreeDiagramEditor from '@/components/TreeDiagramEditor'
import toast from 'react-hot-toast'
import { Node, Edge } from 'reactflow'

// Helper: تشخیص نمودار «بدیهی/تهی» برای جلوگیری از ذخیرهٔ پیش‌فرض
type TreeData = { nodes: Node[]; edges: Edge[] }
function isTrivialTree(data: Partial<TreeData> | null | undefined): boolean {
  if (!data || !Array.isArray((data as any).nodes) || !Array.isArray((data as any).edges)) return true
  const nodes = (data as any).nodes as Node[]
  const edges = (data as any).edges as Edge[]
  if (edges.length > 0) return false
  if (nodes.length <= 1) return true
  return false
}

function CreatePost() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const draftKey = editId ? `create_tree_draft_v1_edit_${editId}` : 'create_tree_draft_v1'
  const [originalPostId, setOriginalPostId] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [
      {
        id: '1',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: 'ابدأ' },
      },
    ],
    edges: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // بارگذاری نمودار اصلی با بیشترین امتیاز یا بازیابی پیش‌نویس ذخیره‌شده
  const hasLoadedRef = useRef(false)
  const skipAutoSaveRef = useRef(false)
  useEffect(() => {
    if (status !== 'authenticated') {
      setIsLoading(false)
      return
    }
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    // اگر در حالت ویرایش از طریق ?edit=ID هستیم، ابتدا تلاش برای بازیابی پیش‌نویس اختصاصی همین آیتم
    const tryLoadEditTarget = async () => {
      if (!editId) return false
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed?.treeData?.nodes && parsed?.treeData?.edges && !isTrivialTree(parsed.treeData)) {
            setTreeData(parsed.treeData)
            setOriginalPostId(parsed.originalPostId ?? null)
            setIsLoading(false)
            return true
          } else {
            try { localStorage.removeItem(draftKey) } catch {}
          }
        }
      } catch (e) {
        console.warn('Failed to restore edit draft from localStorage', e)
      }

      // در صورت نبود پیش‌نویس محلی، دادهٔ پست مورد نظر را واکشی کن
      try {
        const resp = await fetch('/api/editor/posts')
        if (!resp.ok) throw new Error('Failed to fetch editor posts')
        const posts = await resp.json()
        const target = Array.isArray(posts) ? posts.find((p: any) => p.id === editId) : null
        if (target) {
          try {
            const parsedContent = JSON.parse(target.content)
            setTreeData(parsedContent)
          } catch (e) {
            console.error('Invalid target post content JSON', e)
          }
          setOriginalPostId(target.originalPost?.id ?? null)
          setIsLoading(false)
          return true
        }
      } catch (e) {
        console.warn('Failed to load target edit post:', e)
      }
      return false
    }

    const loadTopPost = async () => {
      try {
        const response = await fetch('/api/posts/latest', { cache: 'no-store' })
        if (response.ok) {
          const topPost = await response.json()
          if (topPost) {
            setOriginalPostId(topPost.id)
            const parsedContent = JSON.parse(topPost.content)
            setTreeData(parsedContent)
          }
        }
      } catch (error) {
        console.error('خطأ في تحميل المخطط الرئيسي:', error)
        toast.error('خطأ في تحميل المخطط الرئيسي')
      } finally {
        setIsLoading(false)
      }
    }

    // تلاش برای لود مسیر ویرایش؛ در صورت عدم موفقیت، روال قبلی
    ;(async () => {
      const handled = await tryLoadEditTarget()
      if (!handled) {
        // سناریو: حالت غیر ویرایشی. ابتدا آخرین نسخه منتشرشده را بگیر، سپس تصمیم بگیر آیا پیش‌نویس محلی معتبر است یا خیر
        try {
          const resp = await fetch('/api/posts/latest', { cache: 'no-store' })
          const latest = resp.ok ? await resp.json() : null

          if (!editId) {
            try {
              const saved = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
              if (saved) {
                const parsed = JSON.parse(saved)
                const validDraft = parsed?.treeData?.nodes && parsed?.treeData?.edges && !isTrivialTree(parsed.treeData)
                if (validDraft) {
                  const sameBase = !!latest && (parsed.originalPostId === latest.id)
                  if (sameBase) {
                    setTreeData(parsed.treeData)
                    setOriginalPostId(parsed.originalPostId ?? null)
                    setIsLoading(false)
                    return
                  } else {
                    // پیش‌نویس برای نسخه قدیمی است؛ پاک شود تا نسخه جدید لود گردد
                    try { localStorage.removeItem(draftKey) } catch {}
                  }
                } else {
                  try { localStorage.removeItem(draftKey) } catch {}
                }
              }
            } catch (e) {
              console.warn('Failed to restore draft from localStorage', e)
            }
          }

          if (latest) {
            setOriginalPostId(latest.id)
            try {
              const parsedContent = JSON.parse(latest.content)
              setTreeData(parsedContent)
            } catch (e) {
              console.error('Invalid latest post content JSON', e)
            }
            setIsLoading(false)
            return
          }
        } catch (e) {
          console.warn('Failed to fetch latest approved post', e)
        }

        // در صورت عدم موفقیت، روال fallback
        await loadTopPost()
      }
    })()
  }, [status, editId, draftKey])

  // ذخیره خودکار پیش‌نویس در localStorage با هر تغییر
  useEffect(() => {
    if (status !== 'authenticated') return
    if (skipAutoSaveRef.current) return
    // از ذخیره‌ی پیش‌نویس کاملاً خالی (فقط نود شروع) جلوگیری کنیم
    if (isTrivialTree(treeData)) return
    try {
      const payload = { treeData, originalPostId }
      localStorage.setItem(draftKey, JSON.stringify(payload))
    } catch (e) {
      console.warn('Failed to persist draft into localStorage', e)
    }
  }, [treeData, originalPostId, status, draftKey])

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">جارٍ التحميل...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">يرجى تسجيل الدخول</div>
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
        toast.success('تم إرسال مخططك بنجاح وهو بانتظار الموافقة')

        // پاک کردن پیش‌نویس ذخیره شده پس از ارسال موفق و جلوگیری از ذخیره مجدد حالت پیش‌فرض
        skipAutoSaveRef.current = true
        try { localStorage.removeItem(draftKey) } catch {}

        setTreeData({
          nodes: [
            {
              id: '1',
              type: 'custom',
              position: { x: 400, y: 200 },
              data: { label: 'ابدأ' },
            },
          ],
          edges: [],
        })
        router.push('/')
      } else {
        const text = await response.text()
        let err: any = {}
        try { err = JSON.parse(text) } catch { err = { error: text } }
        console.error('ارسال نمودار ناموفق:', response.status, err)
        toast.error(err?.error ? `خطا: ${err.error}` : `خطا در ارسال (${response.status})`)
      }
    } catch (error) {
      console.error('خطا در ارسال نمودار:', error)
      toast.error('خطا در ارسال نمودار')
    } finally {
      setIsSubmitting(false)
    }
  }

  // وقتی کاربر «إلغاء» می‌زند، پیش‌نویس ذخیره‌شده پاک شود تا دفعه بعد صفحه CREATE از نمودار اصلی منتشر‌شده بارگذاری گردد
  const handleCancel = () => {
    try {
      // جلوگیری از ذخیره‌سازی خودکار بلافاصله بعد از پاکسازی
      skipAutoSaveRef.current = true
      // حذف پیش‌نویس فعلی
      if (typeof window !== 'undefined') {
        localStorage.removeItem(draftKey)
      }
    } catch {}
    // اختیاری: ریست موقت state محلی همین صفحه
    setTreeData({
      nodes: [
        {
          id: '1',
          type: 'custom',
          position: { x: 400, y: 200 },
          data: { label: 'ابدأ' },
        },
      ],
      edges: [],
    })
    // بازگشت
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className="px-4 py-8">
        <div className="max-w-none">
          <h1 className="text-3xl font-bold text-dark-text mb-8 text-center">
            {originalPostId ? 'تحرير المخطط الرئيسي' : 'إنشاء مخطط شجري جديد'}
          </h1>

          {/* نوار اقدامات بالا */}
          <div className="flex gap-4 mb-4 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e as any)}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'جارٍ الإرسال...' : (originalPostId ? 'إرسال التغييرات' : 'إرسال المخطط')}
            </button>
          </div>

          <div className="card">
            <div className="mb-6">
              <label className="block text-dark-text font-medium mb-2">
                المخطط الشجري
              </label>
              <div className="text-sm text-gray-400 mb-4">
                {originalPostId 
                  ? 'تم تحميل المخطط الرئيسي. يمكنك إضافة عقد جديدة، وتحرير أو حذف الموجودة.'
                  : 'لإنشاء مخطط، أضف عقداً جديدة وقم بربطها ببعضها. لربط عقدتين، استخدم الدوائر الموجودة على جوانب العقد.'
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

export default function CreatePostPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-bg flex items-center justify-center"><div className="text-dark-text">جارٍ التحميل...</div></div>}>
      <CreatePost />
    </Suspense>
  )
}