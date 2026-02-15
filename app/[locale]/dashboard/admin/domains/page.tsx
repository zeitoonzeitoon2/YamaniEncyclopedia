'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/lib/navigation'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, X, TrendingUp } from 'lucide-react'
import DomainInvestments from '@/components/DomainInvestments'

type DomainUser = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type DomainExpert = {
  id: string
  role: string
  wing: string
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
  wing: string
  status: string
  createdAt: string
  candidateUser: DomainUser
  proposerUser: DomainUser
  votes: CandidacyVote[]
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

function getRoleBadge(role: string, t: any) {
  if (role === 'HEAD') return { label: t('roleHead'), cls: 'bg-red-600/20 text-red-300 border border-red-600/30' }
  if (role === 'EXPERT') return { label: t('roleExpert'), cls: 'bg-blue-600/20 text-blue-300 border border-blue-600/30' }
  return { label: role, cls: 'bg-site-secondary/30 text-site-text border border-site-border' }
}

export default function AdminDomainsPage() {
  const t = useTranslations('adminDomains')
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
  const [nominateWing, setNominateWing] = useState('RIGHT')
  const [nominating, setNominating] = useState(false)
  const [removingExpertKey, setRemovingExpertKey] = useState<string | null>(null)
  const [loadingCandidacies, setLoadingCandidacies] = useState(false)
  const [pendingCandidacies, setPendingCandidacies] = useState<ExpertCandidacy[]>([])
  const [votingKey, setVotingKey] = useState<string | null>(null)

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

  const philosophyRoot = useMemo(() => roots.find((r) => r.slug === 'philosophy') || null, [roots])

  const fetchDomains = useCallback(async (selectDomainId?: string) => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/domains', { cache: 'no-store' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || t('toast.fetchError'))
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
      const msg = e instanceof Error ? e.message : t('toast.fetchError')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedDomainId, t])

  const fetchCandidacies = useCallback(async (domainId: string) => {
    try {
      setLoadingCandidacies(true)
      const res = await fetch(`/api/admin/domains/candidacies?domainId=${encodeURIComponent(domainId)}`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { candidacies?: ExpertCandidacy[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('toast.candidacyFetchError'))
        return
      }
      setPendingCandidacies(Array.isArray(payload.candidacies) ? payload.candidacies : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.candidacyFetchError')
      toast.error(msg)
    } finally {
      setLoadingCandidacies(false)
    }
  }, [t])

  useEffect(() => {
    const id = selectedDomainId
    if (!id) return
    fetchCandidacies(id)
  }, [selectedDomainId, fetchCandidacies])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    fetchDomains()
  }, [session, status, router, fetchDomains])

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

  const expandAll = () => {
    const allIds: Record<string, boolean> = {}
    const traverse = (nodes: DomainNode[]) => {
      nodes.forEach((node) => {
        allIds[node.id] = true
        if (node.children) traverse(node.children)
      })
    }
    traverse(roots)
    setExpanded(allIds)
  }

  const collapseAll = () => {
    setExpanded({})
  }

  const createDomain = async () => {
    const name = addForm.name.trim()
    const slug = addForm.slug.trim()
    const description = addForm.description.trim()
    if (!name) {
      toast.error(t('toast.nameRequired'))
      return
    }
    try {
      setCreating(true)
      const res = await fetch('/api/admin/domains/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CREATE',
          name,
          slug: slug || undefined,
          description: description || undefined,
          parentId: addParentId || undefined,
        }),
      })

      const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string }
      if (!res.ok) {
        toast.error(payload.error || t('toast.createError'))
        if (payload.details) console.error('Create Proposal Error Details:', payload.details)
        return
      }

      toast.success(t('createProposalSuccess'))
      setAddModalOpen(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.createError')
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const nominateMember = async () => {
    if (!selectedDomain) {
      toast.error(t('selectDomain'))
      return
    }
    if (!selectedUser) {
      toast.error(t('nominateMember')) // Using existing key for prompt
      return
    }
    try {
      setNominating(true)
      const res = await fetch('/api/admin/domains/candidacies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          domainId: selectedDomain.id, 
          candidateUserId: selectedUser.id, 
          role: 'EXPERT',
          wing: nominateWing
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('createNominationError'))
        return
      }
      toast.success(t('createNominationSuccess'))
      setSelectedUser(null)
      setNominateWing('RIGHT')
      setUserQuery('')
      setUserResults([])
      await fetchCandidacies(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.nominateError')
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
        toast.error(payload.error || t('toast.voteError'))
        return
      }
      if (payload.status === 'APPROVED') toast.success(t('toast.approved'))
      else if (payload.status === 'REJECTED') toast.success(t('toast.rejected'))
      else toast.success(t('toast.voteSuccess'))
      await Promise.all([fetchCandidacies(selectedDomain.id), fetchDomains(selectedDomain.id)])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.voteError')
      toast.error(msg)
    } finally {
      setVotingKey(null)
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
        toast.error(payload.error || t('toast.deleteExpertError'))
        return
      }
      toast.success(t('toast.deleteExpertSuccess'))
      await fetchDomains(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.deleteExpertError')
      toast.error(msg)
    } finally {
      setRemovingExpertKey(null)
    }
  }

  const deleteDomain = async () => {
    if (!selectedDomain) return
    try {
      setDeleting(true)
      const res = await fetch('/api/admin/domains/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DELETE',
          targetDomainId: selectedDomain.id,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string }
      if (!res.ok) {
        toast.error(payload.error || t('toast.deleteDomainError'))
        if (payload.details) console.error('Delete Proposal Error Details:', payload.details)
        return
      }
      toast.success(t('createProposalSuccess'))
      setDeleteModalOpen(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('toast.deleteDomainError')
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
            <span className="text-[11px] text-site-muted border border-site-border rounded-full px-2 py-0.5">
              {t('postCount', { count: node.counts.posts })}
            </span>
            {(session?.user?.role === 'ADMIN' || node.experts.some(ex => ex.user.id === session?.user?.id)) && (
              <button
                type="button"
                onClick={() => openAddModal(node)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text text-xs transition-colors"
                title={t('addSubtitle')}
              >
                <Plus size={14} />
                <span className="hidden sm:inline">{t('add')}</span>
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

  if (status === 'loading' || (loading && roots.length === 0)) {
    return (
      <div className="min-h-screen bg-site-bg flex items-center justify-center">
        <div className="text-site-text">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-site-bg flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 relative z-0">
        <h1 className="text-3xl font-bold text-site-text mb-8 text-center heading">{t('title')}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-site-text heading">{t('treeTitle')}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={expandAll}
                  className="px-2 py-1 text-[10px] rounded border border-warm-primary/30 text-warm-primary hover:bg-warm-primary/10 transition-colors"
                >
                  {t('expandAll')}
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="px-2 py-1 text-[10px] rounded border border-site-border text-site-muted hover:bg-site-secondary/30 transition-colors"
                >
                  {t('collapseAll')}
                </button>
              </div>
            </div>

            {roots.length === 0 ? (
              <div className="text-site-muted">{t('noDomains')}</div>
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
              <div className="text-site-muted">{t('selectDomain')}</div>
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
                    {canManageSelectedDomainMembers && (
                      <button
                        type="button"
                        onClick={() => setDeleteModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-200 border border-red-600/30"
                        title={t('delete')}
                        disabled={selectedDomain.slug === 'philosophy'}
                      >
                        <Trash2 size={16} />
                        {t('delete')}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-4 text-sm text-site-muted">
                    <span className="border border-site-border rounded-full px-3 py-1">{t('posts')}: {selectedDomain.counts.posts}</span>
                    <span className="border border-site-border rounded-full px-3 py-1">{t('subdomains')}: {selectedDomain.counts.children}</span>
                  </div>
                </div>

                <div className="border-t border-site-border pt-4">
                  <h3 className="text-lg font-bold text-site-text mb-3 heading">{t('members')}</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Right Wing */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-site-text border-r-4 border-warm-primary pr-2">
                        {t('rightWing')}
                      </h3>
                      <div className="space-y-2">
                        {selectedDomain.experts.filter(ex => ex.wing === 'RIGHT').length === 0 ? (
                          <div className="text-site-muted text-xs italic py-1">{t('noMembersRight')}</div>
                        ) : (
                          selectedDomain.experts.filter(ex => ex.wing === 'RIGHT').map((ex) => {
                            const badge = getRoleBadge(ex.role, t)
                            const key = `${selectedDomain.id}:${ex.user.id}`
                            return (
                              <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-site-border bg-site-secondary/30">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                    <span className="text-site-text font-medium truncate">{ex.user.name || t('noName')}</span>
                                  </div>
                                  <div className="text-xs text-site-muted truncate mt-1">{ex.user.email || ''}</div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    {/* Left Wing */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-site-text border-r-4 border-site-border pr-2">
                        {t('leftWing')}
                      </h3>
                      <div className="space-y-2">
                        {selectedDomain.experts.filter(ex => ex.wing === 'LEFT').length === 0 ? (
                          <div className="text-site-muted text-xs italic py-1">{t('noMembersLeft')}</div>
                        ) : (
                          selectedDomain.experts.filter(ex => ex.wing === 'LEFT').map((ex) => {
                            const badge = getRoleBadge(ex.role, t)
                            const key = `${selectedDomain.id}:${ex.user.id}`
                            return (
                              <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-site-border bg-site-secondary/30">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                    <span className="text-site-text font-medium truncate">{ex.user.name || t('noName')}</span>
                                  </div>
                                  <div className="text-xs text-site-muted truncate mt-1">{ex.user.email || ''}</div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-site-border pt-4">
                    <h3 className="text-lg font-bold text-site-text mb-3 heading">{t('pendingCandidacies')}</h3>
                    {loadingCandidacies ? (
                      <div className="text-site-muted text-sm">{t('loading')}</div>
                    ) : pendingCandidacies.length === 0 ? (
                      <div className="text-site-muted text-sm">{t('noDomains')}</div>
                    ) : (
                      <div className="space-y-2">
                        {pendingCandidacies.map((c) => {
                          const approvals = c.votes.filter((v) => v.vote === 'APPROVE').length
                          const rejections = c.votes.filter((v) => v.vote === 'REJECT').length
                          const myVote = c.votes.find((v) => v.voterUserId === session?.user?.id)?.vote || null
                          const wingLabel = c.wing === 'RIGHT' ? t('rightWing') : t('leftWing')
                          const wingCls = c.wing === 'RIGHT' ? 'bg-warm-primary/10 text-warm-primary border-warm-primary/30' : 'bg-site-secondary/10 text-site-muted border-site-border'
                          return (
                            <div key={c.id} className="p-3 rounded-lg border border-site-border bg-site-secondary/30">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${wingCls}`}>{wingLabel}</span>
                                    <div className="text-site-text font-medium truncate">
                                      {c.candidateUser.name || c.candidateUser.email || t('members')}
                                    </div>
                                  </div>
                                  <div className="text-xs text-site-muted truncate mt-1">
                                    {t('candidate')}: {c.candidateUser.email || '—'} • {t('proposer')}: {c.proposerUser.email || c.proposerUser.name || '—'}
                                  </div>
                                  <div className="mt-2 flex items-center gap-2 text-xs text-site-muted">
                                    <span className="border border-site-border rounded-full px-2 py-0.5">{t('approvals')}: {approvals}</span>
                                    <span className="border border-site-border rounded-full px-2 py-0.5">{t('rejections')}: {rejections}</span>
                                    {myVote && <span className="border border-site-border rounded-full px-2 py-0.5">{t('myVote')}: {myVote === 'APPROVE' ? t('approve') : t('reject')}</span>}
                                  </div>
                                </div>
                                {canManageSelectedDomainMembers && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => voteOnCandidacy(c.id, 'APPROVE')}
                                      disabled={votingKey !== null}
                                      className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                                        myVote === 'APPROVE'
                                          ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                          : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                      } disabled:opacity-50`}
                                    >
                                      {votingKey === `${c.id}:APPROVE` ? '...' : t('approve')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => voteOnCandidacy(c.id, 'REJECT')}
                                      disabled={votingKey !== null}
                                      className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                                        myVote === 'REJECT'
                                          ? 'border-red-600/60 bg-red-600/20 text-site-text'
                                          : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                      } disabled:opacity-50`}
                                    >
                                      {votingKey === `${c.id}:REJECT` ? '...' : t('reject')}
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
                  <div className="mt-4 p-4 rounded-lg border border-site-border bg-site-secondary/30">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus size={16} className="text-warm-accent" />
                        <div className="text-site-text font-semibold">{t('nominateMember')}</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2 relative">
                          <input
                            value={selectedUser ? (selectedUser.email || selectedUser.name || '') : userQuery}
                            onChange={(e) => {
                              setSelectedUser(null)
                              setUserQuery(e.target.value)
                            }}
                            placeholder={t('searchPlaceholder')}
                            className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                          />
                          {selectedUser && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUser(null)
                                setUserQuery('')
                                setUserResults([])
                              }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition-colors"
                              aria-label={t('clear')}
                            >
                              <X size={16} />
                            </button>
                          )}

                          {!selectedUser && userResults.length > 0 && (
                            <div className="absolute z-20 mt-2 w-full rounded-lg border border-site-border bg-site-secondary shadow-xl overflow-hidden">
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
                                    <div className="text-site-text text-sm truncate">{u.name || t('noName')}</div>
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
                            value={nominateWing}
                            onChange={(e) => setNominateWing(e.target.value)}
                            className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                          >
                            <option value="RIGHT">{t('rightWing')}</option>
                            <option value="LEFT">{t('leftWing')}</option>
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
                          {nominating ? '...' : t('sendNomination')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* بخش سرمایه‌گذاری استراتژیک قدرت رای */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-site-text mb-6 flex items-center gap-3 px-2 heading">
            <TrendingUp className="text-warm-primary" />
            {t('strategicInvestments')}
          </h2>
          <DomainInvestments />
        </div>
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-site-border">
              <h2 className="text-xl font-bold text-site-text">{t('addModal.title')}</h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label="close"
                title={t('close')}
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-site-muted">{t('addModal.parent')}: {addParentName || '-'}</div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('addModal.nameLabel')}</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('addModal.slugLabel')}</label>
                <input
                  value={addForm.slug}
                  onChange={(e) => setAddForm((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  placeholder={t('addModal.slugPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('addModal.descLabel')}</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary">
                  {t('addModal.cancel')}
                </button>
                <button type="button" onClick={createDomain} disabled={creating} className="btn-primary disabled:opacity-50">
                  {creating ? '...' : t('addModal.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && selectedDomain && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-site-border">
              <h2 className="text-xl font-bold text-site-text">{t('deleteModal.title')}</h2>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label={t('close')}
                title={t('close')}
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-site-text">
                {t('deleteModal.confirm', { name: selectedDomain.name })}
              </div>
              <div className="text-sm text-site-muted">
                {t('deleteModal.condition')}
              </div>
              <div className="flex items-center gap-3 text-sm text-site-muted">
                <span className="border border-site-border rounded-full px-3 py-1">{t('posts')}: {selectedDomain.counts.posts}</span>
                <span className="border border-site-border rounded-full px-3 py-1">{t('subdomains')}: {selectedDomain.counts.children}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setDeleteModalOpen(false)} className="btn-secondary">
                  {t('deleteModal.cancel')}
                </button>
                <button type="button" onClick={deleteDomain} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {deleting ? '...' : t('deleteModal.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
