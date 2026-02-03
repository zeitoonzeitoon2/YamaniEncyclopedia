'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, X } from 'lucide-react'
import UserManagement from './UserManagement'

type DomainUser = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type DomainExpert = {
  id: string
  role: string
  user: DomainUser
}

type CandidacyVote = {
  voterUserId: string
  vote: string
}

type ExpertCandidacy = {
  id: string
  domainId: string
  candidateUserId: string
  proposerUserId: string
  role: string
  status: string
  createdAt: string
  candidateUser: DomainUser
  proposerUser: DomainUser
  votes: CandidacyVote[]
}

type CourseVote = {
  voterId: string
  vote: string
}

type SyllabusItem = {
  title: string
  description?: string
}

type DomainCourse = {
  id: string
  title: string
  description: string | null
  syllabus?: SyllabusItem[] | null
  status: string
  createdAt: string
  proposerUser: DomainUser | null
  votes: CourseVote[]
}

type DomainNode = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  experts: DomainExpert[]
  counts: { posts: number; children: number }
  children: DomainNode[]
}

type DomainsResponse = { roots: DomainNode[] }

function findDomainById(roots: DomainNode[], id: string): DomainNode | null {
  const stack: DomainNode[] = [...roots]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur.id === id) return cur
    for (const c of cur.children) stack.push(c)
  }
  return null
}

function getRoleBadge(role: string) {
  if (role === 'HEAD') return { label: 'رئيس', cls: 'bg-red-600/20 text-red-300 border border-red-600/30' }
  if (role === 'EXPERT') return { label: 'خبير', cls: 'bg-blue-600/20 text-blue-300 border border-blue-600/30' }
  return { label: role, cls: 'bg-gray-700 text-gray-200 border border-gray-600' }
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [headerUrl, setHeaderUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [loadingDomains, setLoadingDomains] = useState(true)
  const [roots, setRoots] = useState<DomainNode[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addParentName, setAddParentName] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ name: '', slug: '', description: '' })
  const [creating, setCreating] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<DomainUser[]>([])
  const [selectedUser, setSelectedUser] = useState<DomainUser | null>(null)
  const [nominating, setNominating] = useState(false)
  const [nominateRole, setNominateRole] = useState('EXPERT')
  const [removingExpertKey, setRemovingExpertKey] = useState<string | null>(null)
  const [loadingCandidacies, setLoadingCandidacies] = useState(false)
  const [pendingCandidacies, setPendingCandidacies] = useState<ExpertCandidacy[]>([])
  const [votingKey, setVotingKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'members' | 'courses'>('members')
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [domainCourses, setDomainCourses] = useState<DomainCourse[]>([])
  const [courseVotingKey, setCourseVotingKey] = useState<string | null>(null)
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    syllabus: [{ title: '', description: '' }],
  })
  const [proposingCourse, setProposingCourse] = useState(false)

  const selectedDomain = useMemo(() => {
    if (!selectedDomainId) return null
    return findDomainById(roots, selectedDomainId)
  }, [roots, selectedDomainId])

  const canManageSelectedDomainMembers = useMemo(() => {
    const userId = session?.user?.id
    const userRole = session?.user?.role
    if (!userId) return false
    if (!selectedDomain) return false
    if (userRole === 'ADMIN') return true
    if (!selectedDomain.parentId) return false
    const parent = findDomainById(roots, selectedDomain.parentId)
    if (!parent) return false
    return parent.experts.some((ex) => ex.user.id === userId)
  }, [roots, selectedDomain, session?.user?.id, session?.user?.role])

  const canVoteOnSelectedDomainCourses = useMemo(() => {
    const userId = session?.user?.id
    const userRole = session?.user?.role
    if (!userId) return false
    if (!selectedDomain) return false
    if (userRole === 'ADMIN') return true
    return selectedDomain.experts.some((ex) => ex.user.id === userId)
  }, [selectedDomain, session?.user?.id, session?.user?.role])

  const philosophyRoot = useMemo(() => roots.find((r) => r.slug === 'philosophy') || null, [roots])

  const flattenedDomains = useMemo(() => {
    const list: { id: string; name: string; slug: string }[] = []
    const traverse = (nodes: DomainNode[]) => {
      for (const node of nodes) {
        list.push({ id: node.id, name: node.name, slug: node.slug })
        if (node.children) traverse(node.children)
      }
    }
    traverse(roots)
    return list
  }, [roots])

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/')
      return
    }
    if (session.user?.role === 'ADMIN') {
      fetchHeader()
    }
    fetchDomains()
  }, [session, status, router])

  const fetchHeader = async () => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await res.json()
      setHeaderUrl(data.url || null)
    } catch (e) {
      console.error(e)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('يرجى اختيار ملف أولاً')
      return
    }
    try {
      setUploading(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await fetch('/api/admin/settings', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'فشل الرفع')
      }
      const data = await res.json()
      setHeaderUrl(data.url)
      setPreviewUrl(null)
      setSelectedFile(null)
      toast.success('تم تحديث صورة الترويسة بنجاح')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'خطا در آپلود')
    } finally {
      setUploading(false)
    }
  }

  const fetchDomains = async (selectDomainId?: string) => {
    try {
      setLoadingDomains(true)
      const res = await fetch('/api/admin/domains', { cache: 'no-store' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || 'Failed to load domains')
      }
      const data = (await res.json()) as DomainsResponse
      const newRoots = Array.isArray(data.roots) ? data.roots : []
      setRoots(newRoots)

      const preferred = selectDomainId || selectedDomainId
      if (preferred && findDomainById(newRoots, preferred)) {
        setSelectedDomainId(preferred)
      } else if (!selectedDomainId) {
        const root = newRoots.find((r) => r.slug === 'philosophy') || newRoots[0]
        if (root) setSelectedDomainId(root.id)
      }

      const root = newRoots.find((r) => r.slug === 'philosophy') || newRoots[0]
      if (root) setExpanded((prev) => ({ ...prev, [root.id]: true }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في جلب المجالات'
      toast.error(msg)
    } finally {
      setLoadingDomains(false)
    }
  }

  const fetchCandidacies = async (domainId: string) => {
    try {
      setLoadingCandidacies(true)
      const res = await fetch(`/api/admin/domains/candidacies?domainId=${encodeURIComponent(domainId)}`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { candidacies?: ExpertCandidacy[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في جلب الترشيحات')
        return
      }
      setPendingCandidacies(Array.isArray(payload.candidacies) ? payload.candidacies : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في جلب الترشيحات'
      toast.error(msg)
    } finally {
      setLoadingCandidacies(false)
    }
  }

  const fetchCourses = async (domainId: string) => {
    try {
      setLoadingCourses(true)
      const res = await fetch(`/api/admin/domains/courses?domainId=${encodeURIComponent(domainId)}`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { courses?: DomainCourse[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في جلب الدورات')
        return
      }
      setDomainCourses(Array.isArray(payload.courses) ? payload.courses : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في جلب الدورات'
      toast.error(msg)
    } finally {
      setLoadingCourses(false)
    }
  }

  useEffect(() => {
    const id = selectedDomainId
    if (!id) return
    fetchCandidacies(id)
    fetchCourses(id)
  }, [selectedDomainId])

  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      const q = userQuery.trim()
      if (q.length < 2) {
        setUserResults([])
        return
      }
      try {
        const res = await fetch(`/api/admin/domains/users?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json().catch(() => ({}))) as { users?: DomainUser[] }
        if (!active) return
        setUserResults(Array.isArray(data.users) ? data.users : [])
      } catch {
        if (!active) return
        setUserResults([])
      }
    }, 250)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [userQuery])

  const openAddModal = (parent: DomainNode) => {
    setAddParentId(parent.id)
    setAddParentName(parent.name)
    setAddForm({ name: '', slug: '', description: '' })
    setAddModalOpen(true)
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const createDomain = async () => {
    const name = addForm.name.trim()
    const slug = addForm.slug.trim()
    const description = addForm.description.trim()
    if (!name) {
      toast.error('اسم المجال مطلوب')
      return
    }
    try {
      setCreating(true)
      const res = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: slug || undefined,
          description: description || undefined,
          parentId: addParentId || undefined,
        }),
      })

      const payload = (await res.json().catch(() => ({}))) as { error?: string; domain?: { id: string } }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في إنشاء المجال')
        return
      }

      toast.success('تم إنشاء المجال')
      setAddModalOpen(false)
      if (addParentId) setExpanded((prev) => ({ ...prev, [addParentId]: true }))
      const newId = payload.domain?.id
      await fetchDomains(newId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في إنشاء المجال'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const nominateMember = async () => {
    if (!selectedDomain) {
      toast.error('اختر مجالاً أولاً')
      return
    }
    if (!selectedUser) {
      toast.error('اختر مستخدماً أولاً')
      return
    }
    try {
      setNominating(true)
      const res = await fetch('/api/admin/domains/candidacies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomain.id, candidateUserId: selectedUser.id, role: nominateRole }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في إنشاء الترشيح')
        return
      }
      toast.success('تم إرسال الترشيح')
      setSelectedUser(null)
      setNominateRole('EXPERT')
      setUserQuery('')
      setUserResults([])
      await fetchCandidacies(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في إنشاء الترشيح'
      toast.error(msg)
    } finally {
      setNominating(false)
    }
  }

  const voteOnCandidacy = async (candidacyId: string, vote: 'APPROVE' | 'REJECT') => {
    if (!selectedDomain) return
    const key = `${candidacyId}:${vote}`
    try {
      setVotingKey(key)
      const res = await fetch('/api/admin/domains/candidacies/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidacyId, vote }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في التصويت')
        return
      }
      if (payload.status === 'APPROVED') toast.success('تمت الموافقة')
      else if (payload.status === 'REJECTED') toast.success('تم الرفض')
      else toast.success('تم تسجيل التصويت')
      await Promise.all([fetchCandidacies(selectedDomain.id), fetchDomains(selectedDomain.id)])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في التصويت'
      toast.error(msg)
    } finally {
      setVotingKey(null)
    }
  }

  const proposeCourse = async () => {
    if (!selectedDomain) return
    const title = courseForm.title.trim()
    const description = courseForm.description.trim()
    const syllabus = courseForm.syllabus.reduce<SyllabusItem[]>((acc, item) => {
      const itemTitle = item.title.trim()
      const itemDescription = item.description?.trim() || ''
      if (!itemTitle) return acc
      if (itemDescription) {
        acc.push({ title: itemTitle, description: itemDescription })
      } else {
        acc.push({ title: itemTitle })
      }
      return acc
    }, [])
    if (!title) {
      toast.error('عنوان الدورة مطلوب')
      return
    }
    if (syllabus.length === 0) {
      toast.error('المنهج مطلوب')
      return
    }
    try {
      setProposingCourse(true)
      const res = await fetch('/api/admin/domains/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomain.id, title, description: description || undefined, syllabus }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في اقتراح الدورة')
        return
      }
      toast.success('تم إرسال المقترح')
      setCourseForm({ title: '', description: '', syllabus: [{ title: '', description: '' }] })
      await fetchCourses(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في اقتراح الدورة'
      toast.error(msg)
    } finally {
      setProposingCourse(false)
    }
  }

  const voteOnCourse = async (courseId: string, vote: 'APPROVE' | 'REJECT') => {
    if (!selectedDomain) return
    const key = `${courseId}:${vote}`
    try {
      setCourseVotingKey(key)
      const res = await fetch('/api/admin/domains/courses/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, vote }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في التصويت')
        return
      }
      if (payload.status === 'APPROVED') toast.success('تمت الموافقة')
      else if (payload.status === 'REJECTED') toast.success('تم الرفض')
      else toast.success('تم تسجيل التصويت')
      await fetchCourses(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في التصويت'
      toast.error(msg)
    } finally {
      setCourseVotingKey(null)
    }
  }

  const removeExpert = async (userId: string) => {
    if (!selectedDomain) return
    const key = `${selectedDomain.id}:${userId}`
    try {
      setRemovingExpertKey(key)
      const res = await fetch('/api/admin/domains/experts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomain.id, userId }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في حذف الخبير')
        return
      }
      toast.success('تم حذف الخبير')
      await fetchDomains(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في حذف الخبير'
      toast.error(msg)
    } finally {
      setRemovingExpertKey(null)
    }
  }

  const deleteDomain = async () => {
    if (!selectedDomain) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/admin/domains/${encodeURIComponent(selectedDomain.id)}`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; counts?: { children: number; posts: number } }
      if (!res.ok) {
        if (res.status === 409 && payload.counts) {
          toast.error(`لا يمكن الحذف: المجالات الفرعية=${payload.counts.children}، المنشورات=${payload.counts.posts}`)
          return
        }
        toast.error(payload.error || 'خطأ في حذف المجال')
        return
      }
      toast.success('تم حذف المجال')
      setDeleteModalOpen(false)
      setSelectedDomainId(philosophyRoot?.id || null)
      await fetchDomains(philosophyRoot?.id || undefined)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في حذف المجال'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const DomainRow = ({ node, depth }: { node: DomainNode; depth: number }) => {
    const isExpanded = !!expanded[node.id]
    const hasChildren = node.children.length > 0
    const isSelected = selectedDomainId === node.id
    return (
      <div>
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors ${
            isSelected ? 'bg-warm-primary/20 border border-warm-primary/30' : 'hover:bg-site-card/50'
          }`}
          style={{ paddingRight: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => (hasChildren ? toggleExpanded(node.id) : setSelectedDomainId(node.id))}
              className="text-site-muted hover:text-site-text"
              aria-label={hasChildren ? (isExpanded ? 'collapse' : 'expand') : 'select'}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )
              ) : (
                <span className="inline-block w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSelectedDomainId(node.id)}
              className="text-site-text font-medium truncate text-right"
              title={node.name}
            >
              {node.name}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-site-muted border border-gray-700 rounded-full px-2 py-0.5">
              {node.counts.posts} منشورات
            </span>
            {session?.user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => openAddModal(node)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 text-site-text text-xs dark:border-gray-700 dark:hover:bg-gray-800"
                title="إضافة مجال فرعي"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">إضافة</span>
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {node.children.map((c) => (
              <DomainRow key={c.id} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (status === 'loading' || (loadingDomains && roots.length === 0)) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center">
        <div className="text-site-text">جارٍ التحميل...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-site-text mb-8 text-center heading">
          لوحة المدير
        </h1>

        {session?.user?.role === 'ADMIN' && (
          <div className="card mb-8">
            <h2 className="text-xl font-bold text-site-text mb-4 heading">إعدادات الموقع - صورة الترويسة</h2>
            <p className="text-site-muted text-sm mb-3">المقاس المقترح: 1920×480 (نسبة 4:1)، الحد الأقصى للحجم 5 ميجابايت، الصيغ: JPG/PNG/WebP</p>
            {headerUrl && (
              <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4">
                <Image src={headerUrl} alt="Header" fill className="object-cover rounded-lg" unoptimized />
              </div>
            )}
            {previewUrl && (
              <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4 ring-2 ring-warm-accent rounded-lg overflow-hidden">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
              <input type="file" accept="image/*" onChange={handleFileChange} className="text-site-text" />
              <button onClick={handleUpload} disabled={uploading || !selectedFile} className="px-4 py-2 bg-warm-primary text-black rounded disabled:opacity-50">
                {uploading ? 'جارٍ الرفع...' : 'رفع صورة الترويسة'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-site-text heading">شجرة العلوم</h2>
              <button
                type="button"
                onClick={() => {
                  const root = roots.find((r) => r.slug === 'philosophy') || roots[0]
                  if (root) setExpanded((prev) => ({ ...prev, [root.id]: true }))
                }}
                className="btn-secondary text-sm"
              >
                توسيع الجذر
              </button>
            </div>

            {roots.length === 0 ? (
              <div className="text-site-muted">لا توجد نطاقات بعد.</div>
            ) : (
              <div className="space-y-2">
                {roots.map((r) => (
                  <DomainRow key={r.id} node={r} depth={0} />
                ))}
              </div>
            )}
          </div>

          <div className="card">
            {!selectedDomain ? (
              <div className="text-site-muted">اختر مجالاً من القائمة.</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-site-text heading">{selectedDomain.name}</h2>
                      <div className="text-xs text-site-muted mt-1">slug: {selectedDomain.slug}</div>
                      {selectedDomain.description && (
                        <div className="text-sm text-site-text mt-2 leading-6 whitespace-pre-wrap">
                          {selectedDomain.description}
                        </div>
                      )}
                    </div>
                    {session?.user?.role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => setDeleteModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 dark:text-red-300 dark:border-red-700/60 dark:hover:bg-red-900/30"
                        title="حذف المجال"
                        disabled={selectedDomain.slug === 'philosophy'}
                      >
                        <Trash2 size={16} />
                        حذف
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-4 text-sm text-site-muted">
                    <span className="border border-gray-700 rounded-full px-3 py-1">منشورات: {selectedDomain.counts.posts}</span>
                    <span className="border border-gray-700 rounded-full px-3 py-1">مجالات فرعية: {selectedDomain.counts.children}</span>
                  </div>
                </div>

                <div className="border-t border-site-border pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('members')}
                      className={`px-3 py-2 rounded-lg text-sm border ${
                        activeTab === 'members'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                          : 'border-gray-700 bg-gray-900/40 text-site-muted hover:text-site-text'
                      }`}
                    >
                      الأعضاء
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('courses')}
                      className={`px-3 py-2 rounded-lg text-sm border ${
                        activeTab === 'courses'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                          : 'border-gray-700 bg-gray-900/40 text-site-muted hover:text-site-text'
                      }`}
                    >
                      الدورات
                    </button>
                  </div>

                  {activeTab === 'members' ? (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">الأعضاء</h3>
                        <div className="space-y-2">
                          {selectedDomain.experts.length === 0 ? (
                            <div className="text-site-muted text-sm">لا يوجد أعضاء لهذا المجال.</div>
                          ) : (
                            selectedDomain.experts.map((ex) => {
                              const badge = getRoleBadge(ex.role)
                              const key = `${selectedDomain.id}:${ex.user.id}`
                              return (
                                <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-700 bg-site-card/40">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                      <span className="text-site-text font-medium truncate">{ex.user.name || 'بدون اسم'}</span>
                                    </div>
                                    <div className="text-xs text-site-muted truncate mt-1">{ex.user.email || ''}</div>
                                  </div>
                                  {canManageSelectedDomainMembers && (
                                    <button
                                      type="button"
                                      onClick={() => removeExpert(ex.user.id)}
                                      disabled={removingExpertKey === key}
                                      className="text-xs px-3 py-2 rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text disabled:opacity-50"
                                      title="إزالة"
                                    >
                                      {removingExpertKey === key ? '...' : 'حذف'}
                                    </button>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>

                      <div className="border-t border-site-border pt-4">
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">الترشيحات قيد الانتظار</h3>
                        {loadingCandidacies ? (
                          <div className="text-site-muted text-sm">جارٍ التحميل...</div>
                        ) : pendingCandidacies.length === 0 ? (
                          <div className="text-site-muted text-sm">لا توجد ترشيحات حالياً.</div>
                        ) : (
                          <div className="space-y-2">
                            {pendingCandidacies.map((c) => {
                              const approvals = c.votes.filter((v) => v.vote === 'APPROVE').length
                              const rejections = c.votes.filter((v) => v.vote === 'REJECT').length
                              const myVote = c.votes.find((v) => v.voterUserId === session?.user?.id)?.vote || null
                              const roleBadge = getRoleBadge(c.role)
                              return (
                                <div key={c.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge.cls}`}>{roleBadge.label}</span>
                                        <span className="text-site-text font-medium truncate">
                                          {c.candidateUser.name || c.candidateUser.email || 'عضو'}
                                        </span>
                                      </div>
                                      <div className="text-xs text-site-muted truncate mt-1">
                                        المرشح: {c.candidateUser.email || '—'} • المقترِح: {c.proposerUser.email || c.proposerUser.name || '—'}
                                      </div>
                                      <div className="mt-2 flex items-center gap-2 text-xs text-site-muted">
                                        <span className="border border-gray-700 rounded-full px-2 py-0.5">موافقات: {approvals}</span>
                                        <span className="border border-gray-700 rounded-full px-2 py-0.5">رفض: {rejections}</span>
                                        {myVote && <span className="border border-gray-700 rounded-full px-2 py-0.5">تصويتك: {myVote === 'APPROVE' ? 'موافقة' : 'رفض'}</span>}
                                      </div>
                                    </div>
                                    {canManageSelectedDomainMembers && (
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => voteOnCandidacy(c.id, 'APPROVE')}
                                          disabled={votingKey !== null}
                                          className={`text-xs px-3 py-2 rounded-lg border ${
                                            myVote === 'APPROVE'
                                              ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                              : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                                          } disabled:opacity-50`}
                                        >
                                          {votingKey === `${c.id}:APPROVE` ? '...' : 'موافقة'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => voteOnCandidacy(c.id, 'REJECT')}
                                          disabled={votingKey !== null}
                                          className={`text-xs px-3 py-2 rounded-lg border ${
                                            myVote === 'REJECT'
                                              ? 'border-red-600/60 bg-red-600/20 text-site-text'
                                              : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                                          } disabled:opacity-50`}
                                        >
                                          {votingKey === `${c.id}:REJECT` ? '...' : 'رفض'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {canManageSelectedDomainMembers && (
                        <div className="p-4 rounded-lg border border-gray-700 bg-site-secondary/40">
                          <div className="flex items-center gap-2 mb-2">
                            <UserPlus size={16} className="text-warm-accent" />
                            <div className="text-site-text font-semibold">ترشيح عضو</div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="md:col-span-2 relative">
                              <input
                                value={selectedUser ? (selectedUser.email || selectedUser.name || '') : userQuery}
                                onChange={(e) => {
                                  setSelectedUser(null)
                                  setUserQuery(e.target.value)
                                }}
                                placeholder="بحث..."
                                className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                              />
                              {selectedUser && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUser(null)
                                    setUserQuery('')
                                    setUserResults([])
                                  }}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                                  aria-label="clear"
                                >
                                  <X size={16} />
                                </button>
                              )}

                              {!selectedUser && userResults.length > 0 && (
                                <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-700 bg-site-secondary shadow-xl overflow-hidden">
                                  {userResults.map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedUser(u)
                                        setUserResults([])
                                      }}
                                      className="w-full text-right px-3 py-2 hover:bg-site-card/60 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-site-text text-sm truncate">{u.name || 'بدون اسم'}</div>
                                        <div className="text-xs text-site-muted truncate">{u.email || ''}</div>
                                      </div>
                                      <div className="text-xs text-site-muted">{u.role}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <select
                                value={nominateRole}
                                onChange={(e) => setNominateRole(e.target.value)}
                                className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                              >
                                <option value="EXPERT">خبير</option>
                                <option value="HEAD">رئيس</option>
                              </select>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={nominateMember}
                              disabled={nominating || !selectedUser}
                              className="btn-primary disabled:opacity-50"
                            >
                              {nominating ? '...' : 'إرسال الترشيح'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">الدورات المعتمدة</h3>
                        {loadingCourses ? (
                          <div className="text-site-muted text-sm">جارٍ التحميل...</div>
                        ) : domainCourses.filter((c) => c.status === 'APPROVED').length === 0 ? (
                          <div className="text-site-muted text-sm">لا توجد دورات معتمدة بعد.</div>
                        ) : (
                          <div className="space-y-2">
                            {domainCourses
                              .filter((c) => c.status === 'APPROVED')
                              .map((course) => (
                                <div key={course.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-site-text font-medium">{course.title}</div>
                                      {course.description && <div className="text-xs text-site-muted mt-1">{course.description}</div>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Link
                                        href={`/dashboard/admin/courses/${course.id}`}
                                        className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                                      >
                                        إدارة الفصول
                                      </Link>
                                      <Link
                                        href={selectedDomain ? `/academy#domain-${selectedDomain.slug}` : '/academy'}
                                        className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                                      >
                                        عرض في الأكاديمية
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-site-border pt-4">
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">مقترحات قيد التصويت</h3>
                        {loadingCourses ? (
                          <div className="text-site-muted text-sm">جارٍ التحميل...</div>
                        ) : domainCourses.filter((c) => c.status === 'PENDING').length === 0 ? (
                          <div className="text-site-muted text-sm">لا توجد مقترحات حالياً.</div>
                        ) : (
                          <div className="space-y-2">
                            {domainCourses
                              .filter((c) => c.status === 'PENDING')
                              .map((course) => {
                                const approvals = course.votes.filter((v) => v.vote === 'APPROVE').length
                                const rejections = course.votes.filter((v) => v.vote === 'REJECT').length
                                const myVote = course.votes.find((v) => v.voterId === session?.user?.id)?.vote || null
                                return (
                                  <div key={course.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-site-text font-medium">{course.title}</div>
                                        {course.description && <div className="text-xs text-site-muted mt-1">{course.description}</div>}
                                      {Array.isArray(course.syllabus) && course.syllabus.length > 0 && (
                                        <div className="mt-2 space-y-1 text-xs text-site-muted">
                                          {course.syllabus.map((item, index) => (
                                            <div key={`${course.id}-syllabus-${index}`} className="flex items-start gap-2">
                                              <span className="text-[10px] text-site-muted">#{index + 1}</span>
                                              <div className="min-w-0">
                                                <div className="text-site-text">{item.title}</div>
                                                {item.description && (
                                                  <div className="text-[10px] text-site-muted">{item.description}</div>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                        <div className="text-xs text-site-muted mt-1">
                                          المقترِح: {course.proposerUser?.email || course.proposerUser?.name || '—'}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-site-muted">
                                          <span className="border border-gray-700 rounded-full px-2 py-0.5">موافقات: {approvals}</span>
                                          <span className="border border-gray-700 rounded-full px-2 py-0.5">رفض: {rejections}</span>
                                          {myVote && <span className="border border-gray-700 rounded-full px-2 py-0.5">تصويتك: {myVote === 'APPROVE' ? 'موافقة' : 'رفض'}</span>}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                          href={`/dashboard/admin/courses/${course.id}`}
                                          className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                                        >
                                          إدارة الفصول
                                        </Link>
                                        {canVoteOnSelectedDomainCourses && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => voteOnCourse(course.id, 'APPROVE')}
                                              disabled={courseVotingKey !== null}
                                              className={`text-xs px-3 py-2 rounded-lg border ${
                                                myVote === 'APPROVE'
                                                  ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                                  : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                                              } disabled:opacity-50`}
                                            >
                                              {courseVotingKey === `${course.id}:APPROVE` ? '...' : 'موافقة'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => voteOnCourse(course.id, 'REJECT')}
                                              disabled={courseVotingKey !== null}
                                              className={`text-xs px-3 py-2 rounded-lg border ${
                                                myVote === 'REJECT'
                                                  ? 'border-red-600/60 bg-red-600/20 text-site-text'
                                                  : 'border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text'
                                              } disabled:opacity-50`}
                                            >
                                              {courseVotingKey === `${course.id}:REJECT` ? '...' : 'رفض'}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </div>

                      {canVoteOnSelectedDomainCourses && (
                        <div className="p-4 rounded-lg border border-gray-700 bg-site-secondary/40">
                          <div className="flex items-center gap-2 mb-2">
                            <UserPlus size={16} className="text-warm-accent" />
                            <div className="text-site-text font-semibold">اقتراح دورة</div>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            <input
                              value={courseForm.title}
                              onChange={(e) => setCourseForm((prev) => ({ ...prev, title: e.target.value }))}
                              placeholder="عنوان الدورة"
                              className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                            />
                            <textarea
                              value={courseForm.description}
                              onChange={(e) => setCourseForm((prev) => ({ ...prev, description: e.target.value }))}
                              placeholder="وصف مختصر"
                              className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[90px]"
                            />
                            <div className="space-y-3">
                              <div className="text-sm text-site-text font-medium">المنهج</div>
                              <div className="space-y-2">
                                {courseForm.syllabus.map((item, index) => (
                                  <div key={`syllabus-${index}`} className="p-3 rounded-lg border border-gray-700 bg-gray-900/30 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs text-site-muted">الفصل {index + 1}</div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCourseForm((prev) => ({
                                            ...prev,
                                            syllabus: prev.syllabus.length === 1
                                              ? prev.syllabus
                                              : prev.syllabus.filter((_, i) => i !== index),
                                          }))
                                        }
                                        className="text-gray-400 hover:text-gray-200"
                                        title="إزالة"
                                        aria-label="إزالة"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                    <input
                                      value={item.title}
                                      onChange={(e) =>
                                        setCourseForm((prev) => ({
                                          ...prev,
                                          syllabus: prev.syllabus.map((entry, i) =>
                                            i === index ? { ...entry, title: e.target.value } : entry
                                          ),
                                        }))
                                      }
                                      placeholder="عنوان الفصل"
                                      className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                                    />
                                    <textarea
                                      value={item.description || ''}
                                      onChange={(e) =>
                                        setCourseForm((prev) => ({
                                          ...prev,
                                          syllabus: prev.syllabus.map((entry, i) =>
                                            i === index ? { ...entry, description: e.target.value } : entry
                                          ),
                                        }))
                                      }
                                      placeholder="وصف مختصر للفصل"
                                      className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[70px]"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCourseForm((prev) => ({
                                      ...prev,
                                      syllabus: [...prev.syllabus, { title: '', description: '' }],
                                    }))
                                  }
                                  className="px-3 py-1 text-xs rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-site-text"
                                >
                                  إضافة فصل
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={proposeCourse}
                              disabled={proposingCourse}
                              className="btn-primary disabled:opacity-50"
                            >
                              {proposingCourse ? '...' : 'إرسال المقترح'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {session?.user?.role === 'ADMIN' && <UserManagement allDomains={flattenedDomains} />}
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-site-text">إضافة مجال فرعي</h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label="إغلاق"
                title="إغلاق"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-site-muted">الأب: {addParentName || '-'}</div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">الاسم *</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">Slug (اختیاری)</label>
                <input
                  value={addForm.slug}
                  onChange={(e) => setAddForm((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  placeholder="auto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">توضیح (اختیاری)</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary">
                  إلغاء
                </button>
                <button type="button" onClick={createDomain} disabled={creating} className="btn-primary disabled:opacity-50">
                  {creating ? '...' : 'إنشاء'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && selectedDomain && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-site-text">حذف المجال</h2>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label="إغلاق"
                title="إغلاق"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-site-text">
                هل أنت متأكد أنك تريد حذف المجال <b>{selectedDomain.name}</b>؟
              </div>
              <div className="text-sm text-site-muted">
                شرط الحذف: يجب ألا يحتوي المجال على مجالات فرعية أو منشورات.
              </div>
              <div className="flex items-center gap-3 text-sm text-site-muted">
                <span className="border border-gray-700 rounded-full px-3 py-1">منشورات: {selectedDomain.counts.posts}</span>
                <span className="border border-gray-700 rounded-full px-3 py-1">مجالات فرعية: {selectedDomain.counts.children}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setDeleteModalOpen(false)} className="btn-secondary">
                  إلغاء
                </button>
                <button type="button" onClick={deleteDomain} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {deleting ? '...' : 'حذف'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
