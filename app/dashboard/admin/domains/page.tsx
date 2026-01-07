'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, X } from 'lucide-react'

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

export default function AdminDomainsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
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
  const [assignRole, setAssignRole] = useState<'HEAD' | 'EXPERT'>('EXPERT')
  const [assigning, setAssigning] = useState(false)
  const [removingExpertKey, setRemovingExpertKey] = useState<string | null>(null)

  const selectedDomain = useMemo(() => {
    if (!selectedDomainId) return null
    return findDomainById(roots, selectedDomainId)
  }, [roots, selectedDomainId])

  const philosophyRoot = useMemo(() => roots.find((r) => r.slug === 'philosophy') || null, [roots])

  const fetchDomains = async (selectDomainId?: string) => {
    try {
      setLoading(true)
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
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    if (session.user?.role !== 'ADMIN') {
      toast.error('ليست لديك صلاحية المدير')
      router.push('/')
      return
    }
    fetchDomains()
  }, [session, status, router])

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

  const assignExpert = async () => {
    if (!selectedDomain) {
      toast.error('اختر مجالاً أولاً')
      return
    }
    if (!selectedUser) {
      toast.error('اختر مستخدماً أولاً')
      return
    }
    try {
      setAssigning(true)
      const res = await fetch('/api/admin/domains/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomain.id, userId: selectedUser.id, role: assignRole }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'خطأ في تعيين الخبير')
        return
      }
      toast.success('تمت إضافة الخبير')
      setSelectedUser(null)
      setUserQuery('')
      setUserResults([])
      await fetchDomains(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في تعيين الخبير'
      toast.error(msg)
    } finally {
      setAssigning(false)
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
            isSelected ? 'bg-warm-primary/20 border border-warm-primary/30' : 'hover:bg-dark-card/50'
          }`}
          style={{ paddingRight: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => (hasChildren ? toggleExpanded(node.id) : setSelectedDomainId(node.id))}
              className="text-dark-muted hover:text-dark-text"
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
              className="text-dark-text font-medium truncate text-right"
              title={node.name}
            >
              {node.name}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-dark-muted border border-gray-700 rounded-full px-2 py-0.5">
              {node.counts.posts} منشورات
            </span>
            <button
              type="button"
              onClick={() => openAddModal(node)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-dark-text text-xs"
              title="إضافة مجال فرعي"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">إضافة</span>
            </button>
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

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">جارٍ التحميل...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-dark-text mb-8 text-center heading">إدارة المجالات العلمية</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-dark-text heading">شجرة العلوم</h2>
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
              <div className="text-dark-muted">لا توجد نطاقات بعد.</div>
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
              <div className="text-dark-muted">اختر مجالاً من القائمة.</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-dark-text heading">{selectedDomain.name}</h2>
                      <div className="text-xs text-dark-muted mt-1">slug: {selectedDomain.slug}</div>
                      {selectedDomain.description && (
                        <div className="text-sm text-dark-text mt-2 leading-6 whitespace-pre-wrap">
                          {selectedDomain.description}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteModalOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-200 border border-red-600/30"
                      title="حذف المجال"
                      disabled={selectedDomain.slug === 'philosophy'}
                    >
                      <Trash2 size={16} />
                      حذف
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-4 text-sm text-dark-muted">
                    <span className="border border-gray-700 rounded-full px-3 py-1">منشورات: {selectedDomain.counts.posts}</span>
                    <span className="border border-gray-700 rounded-full px-3 py-1">مجالات فرعية: {selectedDomain.counts.children}</span>
                  </div>
                </div>

                <div className="border-t border-dark-border pt-4">
                  <h3 className="text-lg font-bold text-dark-text mb-3 heading">إدارة الخبراء</h3>

                  <div className="space-y-2">
                    {selectedDomain.experts.length === 0 ? (
                      <div className="text-dark-muted text-sm">لا يوجد خبراء لهذا المجال.</div>
                    ) : (
                      selectedDomain.experts.map((ex) => {
                        const badge = getRoleBadge(ex.role)
                        const key = `${selectedDomain.id}:${ex.user.id}`
                        return (
                          <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-700 bg-dark-card/40">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                <span className="text-dark-text font-medium truncate">{ex.user.name || 'بدون اسم'}</span>
                              </div>
                              <div className="text-xs text-dark-muted truncate mt-1">{ex.user.email || ''}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeExpert(ex.user.id)}
                              disabled={removingExpertKey === key}
                              className="text-xs px-3 py-2 rounded-lg border border-gray-700 bg-gray-900/40 hover:bg-gray-800/60 text-dark-text disabled:opacity-50"
                              title="إزالة"
                            >
                              {removingExpertKey === key ? '...' : 'حذف'}
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div className="mt-4 p-4 rounded-lg border border-gray-700 bg-dark-secondary/40">
                    <div className="flex items-center gap-2 mb-2">
                      <UserPlus size={16} className="text-warm-accent" />
                      <div className="text-dark-text font-semibold">إضافة خبير</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2 relative">
                        <input
                          value={selectedUser ? (selectedUser.email || selectedUser.name || '') : userQuery}
                          onChange={(e) => {
                            setSelectedUser(null)
                            setUserQuery(e.target.value)
                          }}
                          placeholder="بحث..."
                          className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
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
                          <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-700 bg-dark-secondary shadow-xl overflow-hidden">
                            {userResults.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setSelectedUser(u)
                                  setUserResults([])
                                }}
                                className="w-full text-right px-3 py-2 hover:bg-dark-card/60 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-dark-text text-sm truncate">{u.name || 'بدون اسم'}</div>
                                  <div className="text-xs text-dark-muted truncate">{u.email || ''}</div>
                                </div>
                                <div className="text-xs text-dark-muted">{u.role}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={assignRole}
                          onChange={(e) => setAssignRole(e.target.value === 'HEAD' ? 'HEAD' : 'EXPERT')}
                          className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                        >
                          <option value="EXPERT">خبير</option>
                          <option value="HEAD">رئيس</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={assignExpert}
                        disabled={assigning || !selectedUser}
                        className="btn-primary disabled:opacity-50"
                      >
                        {assigning ? '...' : 'إضافة'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-secondary rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-dark-text">إضافة مجال فرعي</h2>
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
              <div className="text-sm text-dark-muted">الأب: {addParentName || '-'}</div>
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">الاسم *</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">Slug (اختیاری)</label>
                <input
                  value={addForm.slug}
                  onChange={(e) => setAddForm((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  placeholder="auto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">توضیح (اختیاری)</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-gray-600 bg-dark-bg text-dark-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
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
          <div className="bg-dark-secondary rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
              <h2 className="text-xl font-bold text-dark-text">حذف المجال</h2>
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
              <div className="text-dark-text">
                هل أنت متأكد أنك تريد حذف المجال <b>{selectedDomain.name}</b>؟
              </div>
              <div className="text-sm text-dark-muted">
                شرط الحذف: يجب ألا يحتوي المجال على مجالات فرعية أو منشورات.
              </div>
              <div className="flex items-center gap-3 text-sm text-dark-muted">
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
