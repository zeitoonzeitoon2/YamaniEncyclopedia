'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Link, useRouter } from '@/lib/navigation'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, X, TrendingUp, ArrowRightLeft, Pencil, PieChart } from 'lucide-react'
import OrgChartTree from '@/components/OrgChartTree'
import UserManagement from './UserManagement'
import DomainInvestments from '@/components/DomainInvestments'
import DomainPortfolio from '@/components/DomainPortfolio'
import DomainElectionStatus from '@/components/DomainElectionStatus'
import VotingStatusSummary from '@/components/VotingStatusSummary'


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
  score: number
}

type ElectionRound = {
  id: string
  domainId: string
  wing: string
  startDate: string
  endDate: string
  status: string
}

type ExpertCandidacy = {
  id: string
  domainId: string
  candidateUserId: string
  proposerUserId: string
  role: string
  wing: string
  status: string
  totalScore: number
  weightedScore?: number
  roundId: string | null
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
  voting?: VotingMetrics
}

type DomainProposalVote = {
  voterId: string
  vote: string
}

type DomainProposal = {
  id: string
  type: 'CREATE' | 'DELETE' | 'RENAME'
  name: string | null
  slug: string | null
  description: string | null
  parentId: string | null
  targetDomainId: string | null
  targetDomain: { name: string; parentId: string | null } | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  proposer: { name: string | null; email: string | null }
  votes: DomainProposalVote[]
  voting?: VotingMetrics | null
  createdAt: string
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

function getRoleBadge(role: string, labels: { head: string; expert: string }) {
  if (role === 'HEAD') return { label: labels.head, cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800' }
  if (role === 'EXPERT') return { label: labels.expert, cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800' }
  return { label: role, cls: 'bg-site-secondary/30 text-site-text border border-site-border' }
}

type DomainPrerequisite = {
  id: string
  domainId: string
  courseId: string
  status: string
  createdAt: string
  course: { id: string; title: string }
  proposer: { name: string | null }
  _count: { votes: number }
  votes?: { voterId: string; vote: string }[]
  voting?: VotingMetrics
}

type UserVotingRights = {
  RIGHT: { canVote: boolean; weight: number }
  LEFT: { canVote: boolean; weight: number }
}

type VotingMetrics = {
  eligibleCount: number
  totalRights: number
  votedCount: number
  rightsUsedPercent: number
  approvals?: number
  rejections?: number
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('admin.dashboard')

  const [headerUrl, setHeaderUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [loadingDomains, setLoadingDomains] = useState(true)
  const [roots, setRoots] = useState<DomainNode[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)

  // Layout state: 'default' (2/3 left, 1/3 right), 'tree-expanded' (1/3 left, 2/3 right), 'equal' (1/2 left, 1/2 right)



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
  const [nominateWing, setNominateWing] = useState('RIGHT')
  const [removingExpertKey, setRemovingExpertKey] = useState<string | null>(null)
  const [loadingCandidacies, setLoadingCandidacies] = useState(false)
  const [pendingCandidacies, setPendingCandidacies] = useState<ExpertCandidacy[]>([])
  const [userVotingRights, setUserVotingRights] = useState<UserVotingRights>({
    RIGHT: { canVote: false, weight: 0 },
    LEFT: { canVote: false, weight: 0 }
  })
  const [votingKey, setVotingKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'members' | 'courses' | 'researchers' | 'proposals'>('members')
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [domainProposals, setDomainProposals] = useState<DomainProposal[]>([])
  const [votingOnProposalKey, setVotingOnProposalKey] = useState<string | null>(null)

  const [activeStrategicTab, setActiveStrategicTab] = useState<'investments' | 'portfolio'>('investments')

  const selectedDomain = useMemo(() => {
    if (!selectedDomainId) return null
    return findDomainById(roots, selectedDomainId)
  }, [roots, selectedDomainId])

  const canVoteOnProposal = useCallback((p: any) => {
    if (!session?.user?.id) return false
    
    let votingDomainId = p.type === 'CREATE' ? p.parentId : p.targetDomain?.parentId

    // Special case for RENAME on root domain: voting happens in the domain itself
    if (!votingDomainId && p.type === 'RENAME') {
      votingDomainId = p.targetDomainId || p.targetDomain?.id
    }

    if (!votingDomainId) return false // Root domain create/delete handled by admin only
    
    // Try to find voting domain in roots first to ensure we have the latest data
    let votingDomain = findDomainById(roots, votingDomainId)
    
    // Fallback to selectedDomain if it matches and roots lookup failed (unlikely but safe)
    if (!votingDomain && selectedDomain?.id === votingDomainId) {
        votingDomain = selectedDomain
    }

    if (!votingDomain) return false
    
    const userId = session.user.id
    const expert = votingDomain.experts?.find((ex: any) => ex.user?.id === userId)
    
    if (!expert) return false
    return true
  }, [session?.user?.id, session?.user?.role, roots, selectedDomain])

  const [loadingCourses, setLoadingCourses] = useState(false)
  const [domainCourses, setDomainCourses] = useState<DomainCourse[]>([])
  const [researchPrerequisites, setResearchPrerequisites] = useState<DomainPrerequisite[]>([])
  const [loadingResearch, setLoadingResearch] = useState(false)
  const [proposingResearch, setProposingResearch] = useState(false)
  const [researchVotingKey, setResearchVotingKey] = useState<string | null>(null)
  const [allCourses, setAllCourses] = useState<{ id: string; title: string }[]>([])
  const [loadingAllCourses, setLoadingAllCourses] = useState(false)
  const [selectedResearchCourseId, setSelectedResearchCourseId] = useState<string>('')
  const [courseVotingKey, setCourseVotingKey] = useState<string | null>(null)
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    syllabus: [{ title: '', description: '' }],
  })
  const [proposingCourse, setProposingCourse] = useState(false)

  const [activeRounds, setActiveRounds] = useState<Record<string, ElectionRound | null>>({})
  const [loadingRounds, setLoadingRounds] = useState(false)
  const [extendingRoundKey, setExtendingRoundKey] = useState<string | null>(null)
  const [startingRoundKey, setStartingRoundKey] = useState<string | null>(null)
  const [startingScheduledKey, setStartingScheduledKey] = useState<string | null>(null)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameName, setRenameName] = useState('')

  const canManageSelectedDomainMembers = useMemo(() => {
    const userId = session?.user?.id
    const userRole = session?.user?.role
    if (!userId) return false
    if (!selectedDomain) return false
    if (userRole === 'ADMIN') return true

    // 1. Check if user is expert of selectedDomain
    if (selectedDomain.experts.some((ex) => ex.user.id === userId)) return true

    // 2. Check if user is expert of any direct child domain
    if (selectedDomain.children) {
      for (const child of selectedDomain.children) {
        if (child.experts && child.experts.some((ex) => ex.user.id === userId)) {
          return true
        }
      }
    }
    
    return false
  }, [selectedDomain, session?.user?.id, session?.user?.role])

  const canProposeRename = useMemo(() => {
    const userId = session?.user?.id
    const userRole = session?.user?.role
    if (!userId) return false
    if (!selectedDomain) return false
    if (userRole === 'ADMIN') return true
    
    // Check if HEAD of domain
    const isHead = selectedDomain.experts.some(ex => ex.user.id === userId && ex.role === 'HEAD')
    if (isHead) return true

    // Check if expert of parent
    if (selectedDomain.parentId) {
      const parent = findDomainById(roots, selectedDomain.parentId)
      if (parent && parent.experts.some(ex => ex.user.id === userId)) return true
    } else {
      // Root domain: Allow any expert of the domain to propose rename
      if (selectedDomain.experts.some(ex => ex.user.id === userId)) return true
    }
    return false
  }, [roots, selectedDomain, session?.user?.id, session?.user?.role])

  const canVoteOnSelectedDomainCourses = useMemo(() => {
    const userId = session?.user?.id
    if (!userId) return false
    if (!selectedDomain) return false
    return selectedDomain.experts.some((ex) => ex.user.id === userId)
  }, [selectedDomain, session?.user?.id, session?.user?.role])

  const philosophyRoot = useMemo(() => roots.find((r) => r.slug === 'philosophy') || null, [roots])

  const pendingMembersVotes = useMemo(() => {
    if (!session?.user) return 0
    const canVote = canManageSelectedDomainMembers
    if (!canVote) return 0
    return pendingCandidacies.filter(c => 
      c.status === 'PENDING' && 
      !c.votes.some(v => v.voterUserId === session.user.id)
    ).length
  }, [session?.user, pendingCandidacies, canManageSelectedDomainMembers])

  const pendingCoursesVotes = useMemo(() => {
    if (!session?.user) return 0
    const canVote = canVoteOnSelectedDomainCourses
    if (!canVote) return 0
    return domainCourses.filter(c => 
      c.status === 'PENDING' && 
      !c.votes.some(v => v.voterId === session.user.id)
    ).length
  }, [session?.user, domainCourses, canVoteOnSelectedDomainCourses])

  const pendingResearchersVotes = useMemo(() => {
    if (!session?.user) return 0
    const canVote = canVoteOnSelectedDomainCourses
    if (!canVote) return 0
    return researchPrerequisites.filter(r => 
      r.status === 'PENDING' && 
      !r.votes?.some(v => v.voterUserId === session.user.id)
    ).length
  }, [session?.user, researchPrerequisites, canVoteOnSelectedDomainCourses])

  const pendingProposalsVotes = useMemo(() => {
    if (!session?.user) return 0
    return domainProposals.filter(p => 
      p.status === 'PENDING' && 
      canVoteOnProposal(p) &&
      !p.votes.some(v => v.voterId === session.user.id)
    ).length
  }, [session?.user, domainProposals, canVoteOnProposal])

  const fetchHeader = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await res.json()
      setHeaderUrl(data.url || null)
    } catch (e) {
      console.error(e)
    }
  }, [])



  const fetchLogo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings?type=logo', { cache: 'no-store' })
      const data = await res.json()
      setLogoUrl(data.url || null)
    } catch (e) {
      console.error(e)
    }
  }, [])

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

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setLogoFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setLogoPreviewUrl(url)
    } else {
      setLogoPreviewUrl(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t('uploadSelectFileFirst'))
      return
    }
    try {
      setUploading(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await fetch('/api/admin/settings', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || t('uploadFailed'))
      }
      const data = await res.json()
      setHeaderUrl(data.url)
      setPreviewUrl(null)
      setSelectedFile(null)
      toast.success(t('uploadSuccess'))
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || t('uploadErrorFallback'))
    } finally {
      setUploading(false)
    }
  }

  const handleLogoUpload = async () => {
    if (!logoFile) {
      toast.error(t('uploadSelectFileFirst'))
      return
    }
    try {
      setLogoUploading(true)
      const form = new FormData()
      form.append('file', logoFile)
      form.append('type', 'logo')
      const res = await fetch('/api/admin/settings', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || t('uploadFailed'))
      }
      const data = await res.json()
      setLogoUrl(data.url)
      setLogoPreviewUrl(null)
      setLogoFile(null)
      toast.success(t('uploadLogoSuccess'))
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || t('uploadErrorFallback'))
    } finally {
      setLogoUploading(false)
    }
  }

  const fetchDomains = useCallback(async (selectDomainId?: string) => {
    try {
      setLoadingDomains(true)
      const res = await fetch('/api/admin/domains', { cache: 'no-store' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || t('loadDomainsError'))
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
      const msg = e instanceof Error ? e.message : t('loadDomainsError')
      toast.error(msg)
    } finally {
      setLoadingDomains(false)
    }
  }, [selectedDomainId, t])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      router.push('/')
      return
    }
    if (session.user?.role === 'ADMIN') {
      fetchHeader()
      fetchLogo()
    }
    fetchDomains()
  }, [session, status, router, fetchHeader, fetchLogo, fetchDomains])

  const fetchCandidacies = useCallback(async (domainId: string) => {
    try {
      setLoadingCandidacies(true)
      const res = await fetch(`/api/admin/domains/candidacies?domainId=${encodeURIComponent(domainId)}`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { candidacies?: ExpertCandidacy[]; userVotingRights?: UserVotingRights; error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('loadCandidaciesError'))
        return
      }
      setPendingCandidacies(Array.isArray(payload.candidacies) ? payload.candidacies : [])
      if (payload.userVotingRights) {
        setUserVotingRights(payload.userVotingRights)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('loadCandidaciesError')
      toast.error(msg)
    } finally {
      setLoadingCandidacies(false)
    }
  }, [t])

  const fetchCourses = useCallback(async (domainId: string) => {
    try {
      setLoadingCourses(true)
      const res = await fetch(`/api/admin/domains/courses?domainId=${encodeURIComponent(domainId)}`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { courses?: DomainCourse[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('loadCoursesError'))
        return
      }
      setDomainCourses(Array.isArray(payload.courses) ? payload.courses : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('loadCoursesError')
      toast.error(msg)
    } finally {
      setLoadingCourses(false)
    }
  }, [t])

  const fetchResearchPrerequisites = useCallback(async (domainId: string) => {
    try {
      setLoadingResearch(true)
      const res = await fetch(`/api/admin/domains/${encodeURIComponent(domainId)}/research-prerequisites`, { cache: 'no-store' })
      const payload = (await res.json().catch(() => ({}))) as { prerequisites?: DomainPrerequisite[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'Failed to load research prerequisites')
        return
      }
      setResearchPrerequisites(Array.isArray(payload.prerequisites) ? payload.prerequisites : [])
    } catch (e: unknown) {
      console.error(e)
      toast.error('Error loading research prerequisites')
    } finally {
      setLoadingResearch(false)
    }
  }, [])

  const fetchAllCourses = useCallback(async () => {
    try {
      setLoadingAllCourses(true)
      const res = await fetch('/api/academy/courses', { cache: 'no-store' })
      const payload = await res.json()
      // The API returns { domains: [ { courses: [...] }, ... ] }
      const flatCourses = (payload.domains || []).flatMap((d: any) => d.courses || [])
      setAllCourses(flatCourses)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAllCourses(false)
    }
  }, [])



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
      toast.error(t('domainNameRequired'))
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
          description: description || undefined,
          parentId: addParentId || undefined,
        }),
      })

      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('createProposalError'))
        return
      }

      toast.success(t('createProposalSuccess'))
      setAddModalOpen(false)
      if (selectedDomainId) fetchProposals(selectedDomainId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('createProposalError')
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const nominateMember = async () => {
    if (!selectedDomain) {
      toast.error(t('selectDomainFirst'))
      return
    }
    if (!selectedUser) {
      toast.error(t('selectUserFirst'))
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
      const msg = e instanceof Error ? e.message : t('createNominationError')
      toast.error(msg)
    } finally {
      setNominating(false)
    }
  }

  const voteOnCandidacy = async (candidacyId: string, score: number) => {
    if (!selectedDomain) return
    const key = `${candidacyId}:${score}`
    try {
      setVotingKey(key)
      const res = await fetch('/api/admin/domains/candidacies/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidacyId, score }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('voteError'))
        return
      }
      toast.success(t('voteRecorded'))
      await fetchCandidacies(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('voteError')
      toast.error(msg)
    } finally {
      setVotingKey(null)
    }
  }

  const fetchActiveRounds = useCallback(async (domainId: string) => {
    setLoadingRounds(true)
    try {
      const wings = ['RIGHT', 'LEFT']
      const results: Record<string, ElectionRound | null> = {}
      for (const wing of wings) {
        const res = await fetch(`/api/admin/domains/election?domainId=${domainId}&wing=${wing}`)
        const data = await res.json()
        results[wing] = data.activeRound || null
      }
      setActiveRounds(results)
    } catch (error) {
      console.error('Error fetching active rounds:', error)
    } finally {
      setLoadingRounds(false)
    }
  }, [])

  async function startElectionRound(wing: string) {
    if (!selectedDomainId) return
    setStartingRoundKey(wing)
    try {
      const res = await fetch('/api/admin/domains/election', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomainId, wing })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(t('electionRoundStarted'))
      fetchActiveRounds(selectedDomainId)
    } catch (error: any) {
      toast.error(error.message || 'Error starting round')
    } finally {
      setStartingRoundKey(null)
    }
  }

  async function startScheduledElection(roundId: string) {
    setStartingScheduledKey(roundId)
    try {
      const res = await fetch('/api/admin/domains/election', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, action: 'START_NOW' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(t('electionRoundStarted'))
      if (selectedDomainId) fetchActiveRounds(selectedDomainId)
    } catch (error: any) {
      toast.error(error.message || 'Error starting round')
    } finally {
      setStartingScheduledKey(null)
    }
  }

  async function extendElectionRound(roundId: string, wing: string) {
    setExtendingRoundKey(roundId)
    try {
      const res = await fetch('/api/admin/domains/election', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, action: 'EXTEND' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(t('electionExtended'))
      if (selectedDomainId) {
        fetchActiveRounds(selectedDomainId)
      }
    } catch (error: any) {
      toast.error(error.message || 'Error extending round')
    } finally {
      setExtendingRoundKey(null)
    }
  }

  const [finalizingRoundKey, setFinalizingRoundKey] = useState<string | null>(null)
  async function forceFinalizeElectionRound(roundId: string, wing: string) {
    setFinalizingRoundKey(roundId)
    try {
      const res = await fetch('/api/admin/domains/election', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, action: 'FINALIZE' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(t('electionFinalized'))
      if (selectedDomainId) {
        fetchActiveRounds(selectedDomainId)
        fetchDomains(selectedDomainId)
      }
    } catch (error: any) {
      toast.error(error.message || 'Error finalizing round')
    } finally {
      setFinalizingRoundKey(null)
    }
  }

  const submitRenameProposal = async () => {
    if (!selectedDomain || !renameName.trim()) return
    setLoadingProposals(true)
    try {
      const res = await fetch('/api/admin/domains/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'RENAME',
          targetDomainId: selectedDomain.id,
          name: renameName.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit proposal')
      toast.success(t('renameProposalSubmitted'))
      setRenameModalOpen(false)
      setRenameName('')
      if (selectedDomainId) fetchProposals(selectedDomainId)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoadingProposals(false)
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
      toast.error(t('courseTitleRequired'))
      return
    }
    if (syllabus.length === 0) {
      toast.error(t('syllabusRequired'))
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
        toast.error(payload.error || t('proposeCourseError'))
        return
      }
      toast.success(t('proposeCourseSuccess'))
      setCourseForm({ title: '', description: '', syllabus: [{ title: '', description: '' }] })
      await fetchCourses(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proposeCourseError')
      toast.error(msg)
    } finally {
      setProposingCourse(false)
    }
  }

  const fetchProposals = useCallback(async (domainId?: string) => {
    setLoadingProposals(true)
    try {
      const res = await fetch(`/api/admin/domains/proposals${domainId ? `?domainId=${domainId}` : ''}`)
      const data = await res.json()
      if (!res.ok) {
        console.error('Fetch Proposals Error:', data.error, data.details)
      }
      setDomainProposals(data.proposals || [])
    } catch (error) {
      console.error('Error fetching proposals:', error)
    } finally {
      setLoadingProposals(false)
    }
  }, [])

  useEffect(() => {
    const id = selectedDomainId
    if (!id) return
    fetchCandidacies(id)
    fetchCourses(id)
    fetchResearchPrerequisites(id)
    fetchAllCourses()
    fetchActiveRounds(id)
    fetchProposals(id)
  }, [selectedDomainId, fetchCandidacies, fetchCourses, fetchResearchPrerequisites, fetchAllCourses, fetchActiveRounds, fetchProposals])

  const voteOnProposal = async (proposalId: string, vote: 'APPROVE' | 'REJECT') => {
    setVotingOnProposalKey(`${proposalId}:${vote}`)
    try {
      const res = await fetch(`/api/admin/domains/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(t('voteRecorded'))
      if (selectedDomainId) fetchProposals(selectedDomainId)
      fetchDomains() // Refresh tree as domain might have been created/deleted
    } catch (error: any) {
      toast.error(error.message || 'Error voting')
    } finally {
      setVotingOnProposalKey(null)
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
        toast.error(payload.error || t('voteError'))
        return
      }
      if (payload.status === 'APPROVED') toast.success(t('voteApproved'))
      else if (payload.status === 'REJECTED') toast.success(t('voteRejected'))
      else toast.success(t('voteRecorded'))
      await fetchCourses(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('voteError')
      toast.error(msg)
    } finally {
      setCourseVotingKey(null)
    }
  }

  const proposeResearchPrerequisite = async () => {
    if (!selectedDomain || !selectedResearchCourseId) return
    try {
      setProposingResearch(true)
      const res = await fetch(`/api/admin/domains/${encodeURIComponent(selectedDomain.id)}/research-prerequisites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: selectedResearchCourseId }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'Failed to propose research prerequisite')
        return
      }
      toast.success('Research prerequisite proposed')
      setSelectedResearchCourseId('')
      await fetchResearchPrerequisites(selectedDomain.id)
    } catch (e: unknown) {
      console.error(e)
      toast.error('Error proposing research prerequisite')
    } finally {
      setProposingResearch(false)
    }
  }

  const voteOnResearchPrerequisite = async (prerequisiteId: string, vote: 'APPROVE' | 'REJECT') => {
    if (!selectedDomain) return
    const key = `${prerequisiteId}:${vote}`
    try {
      setResearchVotingKey(key)
      const res = await fetch(`/api/admin/domains/${encodeURIComponent(selectedDomain.id)}/research-prerequisites/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteId, vote }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || t('voteError'))
        return
      }
      toast.success(t('voteRecorded'))
      await fetchResearchPrerequisites(selectedDomain.id)
    } catch (e: unknown) {
      console.error(e)
      toast.error(t('voteError'))
    } finally {
      setResearchVotingKey(null)
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
        toast.error(payload.error || t('removeExpertError'))
        return
      }
      toast.success(t('removeExpertSuccess'))
      await fetchDomains(selectedDomain.id)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('removeExpertError')
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
        toast.error(payload.error || t('createProposalError'))
        if (payload.details) console.error('Delete Proposal Error Details:', payload.details)
        return
      }
      toast.success(t('createProposalSuccess'))
      setDeleteModalOpen(false)
      if (selectedDomainId) fetchProposals(selectedDomainId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('createProposalError')
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }



  if (status === 'loading' || (loadingDomains && roots.length === 0)) {
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

        {session?.user?.role === 'ADMIN' && (
          <div className="card mb-8 transition-shadow duration-300 hover:shadow-lg">
            <h2 className="text-xl font-bold text-site-text mb-4 heading">{t('siteSettingsTitle')}</h2>
            <p className="text-site-muted text-sm mb-3">{t('headerImageHint')}</p>
            {headerUrl && (
              <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4">
                <Image 
                  src={headerUrl} 
                  alt={t('headerImageAlt')} 
                  fill 
                  className="object-cover rounded-lg" 
                  unoptimized 
                  onError={() => setHeaderUrl(null)}
                />
              </div>
            )}
            {previewUrl && (
              <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4 ring-2 ring-warm-accent rounded-lg overflow-hidden">
                <Image 
                  src={previewUrl} 
                  alt={t('previewAlt')} 
                  fill 
                  className="object-cover" 
                  unoptimized 
                />
              </div>
            )}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
              <input type="file" accept="image/*" onChange={handleFileChange} className="text-site-text" />
              <button onClick={handleUpload} disabled={uploading || !selectedFile} className="px-4 py-2 bg-warm-primary text-black rounded disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                {uploading ? t('uploading') : t('uploadHeaderButton')}
              </button>
            </div>
          </div>
        )}
        {session?.user?.role === 'ADMIN' && (
          <div className="card mb-8 transition-shadow duration-300 hover:shadow-lg">
            <h2 className="text-xl font-bold text-site-text mb-4 heading">{t('logoSettingsTitle')}</h2>
            <p className="text-site-muted text-sm mb-3">{t('logoHint')}</p>
            {logoUrl && (
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-20 h-20">
                  <Image 
                    src={logoUrl} 
                    alt={t('logoAlt')} 
                    fill 
                    className="object-contain" 
                    unoptimized 
                    onError={() => setLogoUrl(null)}
                  />
                </div>
              </div>
            )}
            {logoPreviewUrl && (
              <div className="flex items-center gap-4 mb-4 ring-2 ring-warm-accent rounded-lg p-3">
                <div className="relative w-20 h-20">
                  <Image 
                    src={logoPreviewUrl} 
                    alt={t('previewAlt')} 
                    fill 
                    className="object-contain" 
                    unoptimized 
                  />
                </div>
              </div>
            )}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
              <input type="file" accept="image/*" onChange={handleLogoFileChange} className="text-site-text" />
              <button onClick={handleLogoUpload} disabled={logoUploading || !logoFile} className="px-4 py-2 bg-warm-primary text-black rounded disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                {logoUploading ? t('uploading') : t('uploadLogoButton')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-8 transition-all duration-300 ease-in-out">
          {/* Org Chart Tree */}
          <div className="card w-full overflow-hidden transition-shadow duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between mb-4 px-4 pt-4">
              <h2 className="text-xl font-bold text-site-text heading">{t('domainsTree')}</h2>
            </div>
            <OrgChartTree 
              nodes={roots} 
              selectedId={selectedDomainId} 
              onSelect={(node) => setSelectedDomainId(node.id)}
              onAddChild={(node) => openAddModal(node)}
            />
          </div>

          <div className="card flex flex-col min-h-[500px]">
            {!selectedDomain ? (
              <div className="text-site-muted h-full flex items-center justify-center py-20">{t('selectDomainPrompt')}</div>
            ) : (
              <div className="flex-1 space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-site-text heading">{selectedDomain.name}</h2>
                      </div>
                      <div className="text-xs text-site-muted mt-1">
                        {t('slugLabel')}: {selectedDomain.slug}
                      </div>
                      {selectedDomain.description && (
                        <div className="text-sm text-site-text mt-2 leading-6 whitespace-pre-wrap">
                          {selectedDomain.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canProposeRename && (
                        <button
                          type="button"
                          onClick={() => {
                            setRenameName(selectedDomain.name)
                            setRenameModalOpen(true)
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-site-text hover:bg-site-secondary/50 border border-site-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                          title={t('renameDomainTitle')}
                        >
                          <Pencil size={16} />
                          {t('rename')}
                        </button>
                      )}
                      {canManageSelectedDomainMembers && (
                        <button
                          type="button"
                          onClick={() => setDeleteModalOpen(true)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 dark:text-red-300 dark:border-red-700/60 dark:hover:bg-red-900/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md pointer-events-auto relative z-20"
                          title={t('deleteDomain')}
                          disabled={selectedDomain.slug === 'philosophy'}
                        >
                          <Trash2 size={16} />
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-4 text-sm text-site-muted">
                    <span className="border border-site-border rounded-full px-3 py-1">
                      {t('postsCount', { count: selectedDomain.counts.posts })}
                    </span>
                    <span className="border border-site-border rounded-full px-3 py-1">
                      {t('childrenCount', { count: selectedDomain.counts.children })}
                    </span>
                  </div>
                </div>

                <div className="border-t border-site-border pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('members')}
                      className={`relative px-3 py-2 rounded-lg text-sm border transition-all duration-200 hover:shadow-md pointer-events-auto z-20 ${
                        activeTab === 'members'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text shadow-sm'
                          : 'border-site-border bg-site-secondary/30 text-site-muted hover:text-site-text hover:bg-site-secondary/50'
                      }`}
                    >
                      {t('membersTab')}
                      {pendingMembersVotes > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-site-bg animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('courses')}
                      className={`relative px-3 py-2 rounded-lg text-sm border transition-all duration-200 hover:shadow-md pointer-events-auto z-20 ${
                        activeTab === 'courses'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text shadow-sm'
                          : 'border-site-border bg-site-secondary/30 text-site-muted hover:text-site-text hover:bg-site-secondary/50'
                      }`}
                    >
                      {t('coursesTab')}
                      {pendingCoursesVotes > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-site-bg animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('researchers')}
                      className={`relative px-3 py-2 rounded-lg text-sm border transition-all duration-200 hover:shadow-md pointer-events-auto z-20 ${
                        activeTab === 'researchers'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text shadow-sm'
                          : 'border-site-border bg-site-secondary/30 text-site-muted hover:text-site-text hover:bg-site-secondary/50'
                      }`}
                    >
                      {t('researchersTab')}
                      {pendingResearchersVotes > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-site-bg animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('proposals')}
                      className={`relative px-3 py-2 rounded-lg text-sm border transition-all duration-200 hover:shadow-md pointer-events-auto z-20 ${
                        activeTab === 'proposals'
                          ? 'border-warm-primary bg-warm-primary/20 text-site-text shadow-sm'
                          : 'border-site-border bg-site-secondary/30 text-site-muted hover:text-site-text hover:bg-site-secondary/50'
                      }`}
                    >
                      {t('proposalsTab')}
                      {pendingProposalsVotes > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-site-bg animate-pulse" />
                      )}
                    </button>
                  </div>

                  {activeTab === 'members' ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Right Wing */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="text-lg font-bold text-site-text heading border-r-4 border-warm-primary pr-3">
                              {t('rightWing')}
                            </h3>
                            {activeRounds['RIGHT'] ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded border ${
                                  activeRounds['RIGHT'].status === 'HEAD_ACTIVE' 
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800' 
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
                                }`}>
                                  {activeRounds['RIGHT'].status === 'HEAD_ACTIVE' 
                                    ? t('headElectionLabel') 
                                    : (new Date(activeRounds['RIGHT'].startDate) > new Date() 
                                      ? t('nextElectionLabel', { date: new Date(activeRounds['RIGHT'].startDate).toLocaleDateString('en-GB') })
                                      : t('electionRound')
                                    )
                                  }
                                </span>
                                {new Date(activeRounds['RIGHT'].startDate) > new Date() && (
                                  <span className="text-[10px] text-site-muted italic px-1 hidden">
                                    {new Date(activeRounds['RIGHT'].startDate).toLocaleDateString('en-GB')}
                                  </span>
                                )}
                                {canManageSelectedDomainMembers && (
                                  <div className="flex items-center gap-2">
                                    {new Date(activeRounds['RIGHT'].startDate) > new Date() ? (
                                      session?.user?.role === 'ADMIN' && (
                                        <button
                                          type="button"
                                          onClick={() => startScheduledElection(activeRounds['RIGHT']!.id)}
                                          disabled={startingScheduledKey !== null}
                                          className="text-[10px] px-2 py-1 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                        >
                                          {startingScheduledKey === activeRounds['RIGHT']!.id ? '...' : 'Start Now'}
                                        </button>
                                      )
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => extendElectionRound(activeRounds['RIGHT']!.id, 'RIGHT')}
                                          disabled={extendingRoundKey !== null}
                                          className="text-[10px] px-2 py-1 rounded border border-warm-primary/50 text-warm-primary hover:bg-warm-primary/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                        >
                                          {extendingRoundKey === activeRounds['RIGHT']!.id ? '...' : t('extendElection')}
                                        </button>
                                        {session?.user?.role === 'ADMIN' && (
                                          <button
                                            type="button"
                                            onClick={() => forceFinalizeElectionRound(activeRounds['RIGHT']!.id, 'RIGHT')}
                                            disabled={finalizingRoundKey !== null}
                                            className="text-[10px] px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                          >
                                            {finalizingRoundKey === activeRounds['RIGHT']!.id ? '...' : t('forceEndElection')}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              session?.user?.role === 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => startElectionRound('RIGHT')}
                                  disabled={startingRoundKey !== null}
                                  className="text-[10px] px-2 py-1 rounded border border-warm-primary/50 text-warm-primary hover:bg-warm-primary/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                >
                                  {startingRoundKey === 'RIGHT' ? '...' : t('startElectionRound')}
                                </button>
                              )
                            )}
                          </div>
                          {activeRounds['RIGHT'] && new Date(activeRounds['RIGHT'].startDate) <= new Date() && (
                            <div className="text-[10px] text-site-muted flex items-center gap-2 mb-2">
                              <span>{t('remainingTime', { time: new Date(activeRounds['RIGHT'].endDate).toLocaleDateString('en-GB') })}</span>
                            </div>
                          )}
                          <DomainElectionStatus domainId={selectedDomain.id} wing="RIGHT" />
                          <div className="space-y-2">
                            {selectedDomain.experts.filter(ex => ex.wing === 'RIGHT').length === 0 ? (
                              <div className="text-site-muted text-sm italic py-2">{t('noMembersRight')}</div>
                            ) : (
                              selectedDomain.experts.filter(ex => ex.wing === 'RIGHT').map((ex) => {
                                const badge = getRoleBadge(ex.role, { head: t('roleHead'), expert: t('roleExpert') })
                                const key = `${selectedDomain.id}:${ex.user.id}`
                                return (
                                  <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-site-border bg-site-secondary/30 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-warm-primary/30">
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
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="text-lg font-bold text-site-text heading border-r-4 border-site-border pr-3">
                              {t('leftWing')}
                            </h3>
                            {activeRounds['LEFT'] ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded border ${
                                  activeRounds['LEFT'].status === 'HEAD_ACTIVE' 
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800' 
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
                                }`}>
                                  {activeRounds['LEFT'].status === 'HEAD_ACTIVE' 
                                    ? t('headElectionLabel') 
                                    : (new Date(activeRounds['LEFT'].startDate) > new Date() 
                                      ? t('nextElectionLabel', { date: new Date(activeRounds['LEFT'].startDate).toLocaleDateString('en-GB') })
                                      : t('electionRound')
                                    )
                                  }
                                </span>
                                {new Date(activeRounds['LEFT'].startDate) > new Date() && (
                                  <span className="text-[10px] text-site-muted italic px-1 hidden">
                                    {new Date(activeRounds['LEFT'].startDate).toLocaleDateString('en-GB')}
                                  </span>
                                )}
                                {canManageSelectedDomainMembers && (
                                  <div className="flex items-center gap-2">
                                    {new Date(activeRounds['LEFT'].startDate) > new Date() ? (
                                      session?.user?.role === 'ADMIN' && (
                                        <button
                                          type="button"
                                          onClick={() => startScheduledElection(activeRounds['LEFT']!.id)}
                                          disabled={startingScheduledKey !== null}
                                          className="text-[10px] px-2 py-1 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                        >
                                          {startingScheduledKey === activeRounds['LEFT']!.id ? '...' : 'Start Now'}
                                        </button>
                                      )
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => extendElectionRound(activeRounds['LEFT']!.id, 'LEFT')}
                                          disabled={extendingRoundKey !== null}
                                          className="text-[10px] px-2 py-1 rounded border border-gray-500/50 text-gray-400 hover:bg-gray-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                        >
                                          {extendingRoundKey === activeRounds['LEFT']!.id ? '...' : t('extendElection')}
                                        </button>
                                        {session?.user?.role === 'ADMIN' && (
                                          <button
                                            type="button"
                                            onClick={() => forceFinalizeElectionRound(activeRounds['LEFT']!.id, 'LEFT')}
                                            disabled={finalizingRoundKey !== null}
                                            className="text-[10px] px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                          >
                                            {finalizingRoundKey === activeRounds['LEFT']!.id ? '...' : t('forceEndElection')}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              session?.user?.role === 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => startElectionRound('LEFT')}
                                  disabled={startingRoundKey !== null}
                                  className="text-[10px] px-2 py-1 rounded border border-gray-500/50 text-gray-400 hover:bg-gray-500/10 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                >
                                  {startingRoundKey === 'LEFT' ? '...' : t('startElectionRound')}
                                </button>
                              )
                            )}
                          </div>
                          {activeRounds['LEFT'] && new Date(activeRounds['LEFT'].startDate) <= new Date() && (
                            <div className="text-[10px] text-site-muted flex items-center gap-2 mb-2">
                              <span>{t('remainingTime', { time: new Date(activeRounds['LEFT'].endDate).toLocaleDateString('en-GB') })}</span>
                            </div>
                          )}
                          <DomainElectionStatus domainId={selectedDomain.id} wing="LEFT" />
                          <div className="space-y-2">
                            {selectedDomain.experts.filter(ex => ex.wing === 'LEFT').length === 0 ? (
                              <div className="text-site-muted text-sm italic py-2">{t('noMembersLeft')}</div>
                            ) : (
                              selectedDomain.experts.filter(ex => ex.wing === 'LEFT').map((ex) => {
                                const badge = getRoleBadge(ex.role, { head: t('roleHead'), expert: t('roleExpert') })
                                const key = `${selectedDomain.id}:${ex.user.id}`
                                return (
                                  <div key={ex.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-site-border bg-site-secondary/30 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-warm-primary/30">
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

                      <div className="border-t border-site-border pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold text-site-text heading">{t('pendingNominationsTitle')}</h3>
                          {activeRounds['RIGHT']?.status === 'HEAD_ACTIVE' && (
                             <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full">
                               {t('headElectionRight')}
                             </span>
                          )}
                          {activeRounds['LEFT']?.status === 'HEAD_ACTIVE' && (
                             <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full">
                               {t('headElectionLeft')}
                             </span>
                          )}
                        </div>
                        {loadingCandidacies ? (
                          <div className="text-site-muted text-sm">{t('loading')}</div>
                        ) : pendingCandidacies.length === 0 ? (
                          <div className="text-site-muted text-sm">{t('noPendingNominations')}</div>
                        ) : (
                          <div className="space-y-2">
                            {pendingCandidacies.map((c) => {
                              const myVote = c.votes.find((v) => v.voterUserId === session?.user?.id)
                              const myScore = myVote?.score || 0
                              const roleBadge = getRoleBadge(c.role, { head: t('roleHead'), expert: t('roleExpert') })
                              const wingLabel = c.wing === 'RIGHT' ? t('rightWing') : t('leftWing')
                              const wingCls = c.wing === 'RIGHT' ? 'bg-warm-primary/10 text-warm-primary border-warm-primary/30' : 'bg-site-secondary/10 text-site-muted border-site-border'
                              
                              const isActiveRound = activeRounds[c.wing]?.id === c.roundId
                              const isHeadElectionCandidate = c.role === 'HEAD' && activeRounds[c.wing]?.status === 'HEAD_ACTIVE'

                              return (
                                <div key={c.id} className="p-3 rounded-lg border border-site-border bg-site-secondary/30">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        {!isHeadElectionCandidate && (
                                          <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge.cls}`}>{roleBadge.label}</span>
                                        )}
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${wingCls}`}>{wingLabel}</span>
                                        <span className="text-site-text font-medium truncate">
                                          {c.candidateUser.name || c.candidateUser.email || t('memberFallback')}
                                        </span>
                                      </div>
                                      <div className="text-xs text-site-muted truncate mt-1">
                                        {t('candidateLabel')}: {c.candidateUser.email || '—'} • {t('proposerLabel')}:{' '}
                                        {c.proposerUser.email || c.proposerUser.name || '—'}
                                      </div>
                                      <div className="mt-2 flex items-center gap-2 text-xs text-site-muted">
                                        <span className="border border-warm-primary/30 text-warm-primary rounded-full px-2 py-0.5 font-bold">
                                          {t('totalScore', { score: c.weightedScore ?? c.totalScore })}
                                        </span>
                                        {myScore > 0 && (
                                          <span className="border border-site-border rounded-full px-2 py-0.5">
                                            {t('yourVote', { vote: myScore })}
                                          </span>
                                        )}
                                        {!isActiveRound && c.roundId && (
                                          <span className="text-red-400 text-[10px]">{t('nominationPeriodEnded')}</span>
                                        )}
                                      </div>
                                    </div>
                                    {isActiveRound && (canVoteOnSelectedDomainCourses || userVotingRights[(c.wing || 'RIGHT').toUpperCase() as 'LEFT' | 'RIGHT']?.canVote) && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        {[1, 2, 3].map((score) => (
                                          <button
                                            key={score}
                                            type="button"
                                            onClick={() => voteOnCandidacy(c.id, score)}
                                            disabled={votingKey !== null}
                                            className={`text-xs w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 hover:scale-110 hover:shadow-sm ${
                                              myScore === score
                                                ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                                : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                            } disabled:opacity-50`}
                                            title={t(`score${score}`)}
                                          >
                                            {votingKey === `${c.id}:${score}` ? '...' : score}
                                          </button>
                                        ))}
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
                        <div className="p-4 rounded-lg border border-site-border bg-site-secondary/30">
                          <div className="flex items-center gap-2 mb-2">
                            <UserPlus size={16} className="text-warm-accent" />
                            <div className="text-site-text font-semibold">{t('nominateMemberTitle')}</div>
                          </div>

                          <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-grow">
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
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition-all duration-200 hover:scale-110"
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
                                      className="w-full text-right px-3 py-2 hover:bg-site-card/60 flex items-center justify-between gap-2 transition-all duration-200"
                                      title={`${u.name || t('noName')} (${u.email || ''})`}
                                    >
                                      <div className="min-w-0 flex-1 text-right">
                                        <div className="text-site-text text-sm truncate">{u.name || t('noName')}</div>
                                        <div className="text-xs text-site-muted truncate">{u.email || ''}</div>
                                      </div>
                                      <div className="text-xs text-site-muted whitespace-nowrap">{u.role}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="md:w-48 shrink-0">
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

                          <div className="mt-3 flex items-center justify-between gap-4">
                            {!activeRounds[nominateWing] && (
                              <div className="text-xs text-red-400 font-medium">
                                {t('noActiveElection')}
                              </div>
                            )}
                                    <button
                                      type="button"
                                      onClick={nominateMember}
                                      disabled={nominating || !selectedUser || !activeRounds[nominateWing]}
                                      className="btn-primary disabled:opacity-50 pointer-events-auto relative z-20"
                                    >
                              {nominating ? '...' : t('sendNomination')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'proposals' ? (
                    <div className="space-y-6">
                      <h3 className="text-lg font-bold text-site-text mb-3 heading">{t('domainProposalsTitle')}</h3>
                      {loadingProposals ? (
                        <div className="text-site-muted text-sm">{t('loading')}</div>
                      ) : domainProposals.length === 0 ? (
                        <div className="text-site-muted text-sm">{t('noDomainProposals')}</div>
                      ) : (
                        <div className="space-y-3">
                          {domainProposals.map((p) => {
                            const myVote = p.votes.find(v => v.voterId === session?.user?.id)?.vote
                            const canVote = canVoteOnProposal(p)
                            return (
                              <div key={p.id} className="p-4 rounded-lg border border-site-border bg-site-secondary/30 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                        p.type === 'CREATE' 
                                          ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                          : p.type === 'DELETE'
                                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      }`}>
                                        {t(`proposalType_${p.type}`)}
                                      </span>
                                      <span className="text-site-text font-medium flex items-center gap-2">
                                        {p.type === 'CREATE' ? (
                                          p.name
                                        ) : p.type === 'RENAME' ? (
                                          <>
                                            <span className="line-through opacity-50">{p.targetDomain?.name}</span>
                                            <ArrowRightLeft size={14} className="text-site-muted" />
                                            <span className="text-blue-400">{p.name}</span>
                                          </>
                                        ) : (
                                          p.targetDomain?.name
                                        )}
                                      </span>
                                    </div>
                                    <div className="text-xs text-site-muted mt-1">
                                      {t('proposerLabel')}: {p.proposer.name || p.proposer.email}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-site-muted">
                                      <span className="border border-site-border rounded-full px-2 py-0.5 bg-site-bg">
                                        {t('eligibleVoters', { count: p.voting?.eligibleCount || 0 })}
                                      </span>
                                      <span className="border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400">
                                        {t('approvals', { count: p.votes.filter(v => v.vote === 'APPROVE').length })}
                                      </span>
                                      <span className="border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400">
                                        {t('rejections', { count: p.votes.filter(v => v.vote === 'REJECT').length })}
                                      </span>
                                    </div>
                                    {p.voting && (
                                      <div className="mt-2">
                                        <VotingStatusSummary
                                          eligibleCount={p.voting.eligibleCount}
                                          totalRights={p.voting.totalRights}
                                          votedCount={p.voting.votedCount}
                                          rightsUsedPercent={p.voting.rightsUsedPercent}
                                          labels={{
                                            eligible: t('votingEligibleLabel'),
                                            totalRights: t('votingRightsLabel'),
                                            voted: t('votingVotedLabel'),
                                            rightsUsed: t('votingRightsUsedLabel')
                                          }}
                                        />
                                      </div>
                                    )}
                                    {p.description && (
                                      <div className="text-sm text-site-text mt-2 italic">
                                        {p.description}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                      p.status === 'APPROVED' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                      p.status === 'REJECTED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                    }`}>
                                      {t(`proposalStatus_${p.status}`)}
                                    </span>
                                  </div>
                                </div>

                                {p.status === 'PENDING' && canVote && (
                                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-site-border">
                                    <button
                                      type="button"
                                      onClick={() => voteOnProposal(p.id, 'APPROVE')}
                                      disabled={votingOnProposalKey !== null}
                                      className={`relative z-20 text-xs px-3 py-2 rounded-lg border pointer-events-auto transition-all duration-200 hover:shadow-sm ${
                                        myVote === 'APPROVE'
                                          ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                          : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                      } disabled:opacity-50`}
                                    >
                                      {votingOnProposalKey === `${p.id}:APPROVE` ? '...' : t('approve')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => voteOnProposal(p.id, 'REJECT')}
                                      disabled={votingOnProposalKey !== null}
                                      className={`relative z-20 text-xs px-3 py-2 rounded-lg border pointer-events-auto transition-all duration-200 hover:shadow-sm ${
                                        myVote === 'REJECT'
                                          ? 'border-red-600/60 bg-red-600/20 text-site-text'
                                          : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                      } disabled:opacity-50`}
                                    >
                                      {votingOnProposalKey === `${p.id}:REJECT` ? '...' : t('reject')}
                                    </button>
                                  </div>
                                )}
                                {p.status === 'PENDING' && !canVote && (
                                  <div className="text-[10px] text-site-muted italic text-right pt-2 border-t border-site-border">
                                    {t('onlyParentExpertsCanVote')}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'researchers' ? (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-site-text mb-1 heading">{t('researchersSectionTitle')}</h3>
                        <p className="text-sm text-site-muted mb-4">{t('researchPrerequisitesDesc')}</p>
                        
                        <div className="space-y-2">
                          {loadingResearch ? (
                            <div className="text-site-muted text-sm">{t('loading')}</div>
                          ) : researchPrerequisites.length === 0 ? (
                            <div className="text-site-muted text-sm">{t('noResearchPrerequisites')}</div>
                          ) : (
                            researchPrerequisites.map((p) => {
                              const myVote = p.votes?.find(v => v.voterId === session?.user?.id)?.vote || null
                              return (
                                <div key={p.id} className="p-3 rounded-lg border border-site-border bg-site-secondary/30">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-site-text font-medium truncate">{p.course.title}</div>
                                      <div className="text-xs text-site-muted mt-1">
                                        {t('proposerLabel')}: {p.proposer.name || '—'} • {p.status === 'APPROVED' ? <span className="text-green-400">{t('approvedStatus')}</span> : p.status === 'REJECTED' ? <span className="text-red-400">{t('rejectedStatus')}</span> : <span className="text-yellow-400">{t('pendingStatus')}</span>}
                                      </div>
                                      {p.voting && (
                                        <div className="mt-2">
                                          <VotingStatusSummary
                                            eligibleCount={p.voting.eligibleCount}
                                            totalRights={p.voting.totalRights}
                                            votedCount={p.voting.votedCount}
                                            rightsUsedPercent={p.voting.rightsUsedPercent}
                                            labels={{
                                              eligible: t('votingEligibleLabel'),
                                              totalRights: t('votingRightsLabel'),
                                              voted: t('votingVotedLabel'),
                                              rightsUsed: t('votingRightsUsedLabel')
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    {canVoteOnSelectedDomainCourses && p.status === 'PENDING' && (
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => voteOnResearchPrerequisite(p.id, 'APPROVE')}
                                          disabled={researchVotingKey !== null}
                                          className={`text-xs px-3 py-2 rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50`}
                                        >
                                          {researchVotingKey === `${p.id}:APPROVE` ? '...' : t('approve')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {myVote && (
                                    <div className="mt-2 text-[10px] text-site-muted">
                                      {t('yourVote', { vote: myVote === 'APPROVE' ? t('approve') : t('reject') })}
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>

                      {canVoteOnSelectedDomainCourses && (
                        <div className="p-4 rounded-lg border border-site-border bg-site-secondary/30">
                          <h3 className="text-site-text font-semibold mb-3">{t('proposeResearchPrerequisite')}</h3>
                          <div className="flex flex-col gap-3">
                            <select
                              value={selectedResearchCourseId}
                              onChange={(e) => setSelectedResearchCourseId(e.target.value)}
                              className="w-full p-2 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                            >
                              <option value="">{t('selectCoursePlaceholder')}</option>
                              {allCourses.map(c => (
                                <option key={c.id} value={c.id}>{c.title}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={proposeResearchPrerequisite}
                              disabled={proposingResearch || !selectedResearchCourseId}
                              className="btn-primary w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                            >
                              {proposingResearch ? '...' : t('propose')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">{t('approvedCoursesTitle')}</h3>
                        {loadingCourses ? (
                          <div className="text-site-muted text-sm">{t('loading')}</div>
                        ) : domainCourses.filter((c) => c.status === 'APPROVED').length === 0 ? (
                          <div className="text-site-muted text-sm">{t('noApprovedCourses')}</div>
                        ) : (
                          <div className="space-y-2">
                            {domainCourses
                              .filter((c) => c.status === 'APPROVED')
                              .map((course) => (
                                <div key={course.id} className="p-3 rounded-lg border border-site-border bg-site-secondary/30">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-site-text font-medium">{course.title}</div>
                                      {course.description && <div className="text-xs text-site-muted mt-1">{course.description}</div>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Link
                                        href={`/dashboard/admin/courses/${course.id}`}
                                        className="px-3 py-1 text-xs rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                      >
                                        {t('manageChapters')}
                                      </Link>
                                      <Link
                                        href={selectedDomain ? `/academy#domain-${selectedDomain.slug}` : '/academy'}
                                        className="px-3 py-1 text-xs rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                      >
                                        {t('viewInAcademy')}
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-site-border pt-4">
                        <h3 className="text-lg font-bold text-site-text mb-3 heading">{t('pendingCourseProposalsTitle')}</h3>
                        {loadingCourses ? (
                          <div className="text-site-muted text-sm">{t('loading')}</div>
                        ) : domainCourses.filter((c) => c.status === 'PENDING').length === 0 ? (
                          <div className="text-site-muted text-sm">{t('noPendingProposals')}</div>
                        ) : (
                          <div className="space-y-2">
                            {domainCourses
                              .filter((c) => c.status === 'PENDING')
                              .map((course) => {
                                const approvals = course.votes.filter((v) => v.vote === 'APPROVE').length
                                const rejections = course.votes.filter((v) => v.vote === 'REJECT').length
                                const myVote = course.votes.find((v) => v.voterId === session?.user?.id)?.vote || null
                                return (
                                  <div key={course.id} className="p-3 rounded-lg border border-site-border bg-site-secondary/30">
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
                                          {t('proposerLabel')}: {course.proposerUser?.email || course.proposerUser?.name || '—'}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-site-muted">
                                          <span className="border border-site-border rounded-full px-2 py-0.5">
                                            {t('approvals', { count: approvals })}
                                          </span>
                                          <span className="border border-site-border rounded-full px-2 py-0.5">
                                            {t('rejections', { count: rejections })}
                                          </span>
                                          {myVote && (
                                            <span className="border border-site-border rounded-full px-2 py-0.5">
                                              {t('yourVote', { vote: myVote === 'APPROVE' ? t('approve') : t('reject') })}
                                            </span>
                                          )}
                                        </div>
                                        {course.voting && (
                                          <div className="mt-2">
                                            <VotingStatusSummary
                                              eligibleCount={course.voting.eligibleCount}
                                              totalRights={course.voting.totalRights}
                                              votedCount={course.voting.votedCount}
                                              rightsUsedPercent={course.voting.rightsUsedPercent}
                                              labels={{
                                                eligible: t('votingEligibleLabel'),
                                                totalRights: t('votingRightsLabel'),
                                                voted: t('votingVotedLabel'),
                                                rightsUsed: t('votingRightsUsedLabel')
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                          href={`/dashboard/admin/courses/${course.id}`}
                                          className="px-3 py-1 text-xs rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                        >
                                          {t('manageChapters')}
                                        </Link>
                                        {canVoteOnSelectedDomainCourses && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => voteOnCourse(course.id, 'APPROVE')}
                                              disabled={courseVotingKey !== null}
                                              className={`text-xs px-3 py-2 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                                                myVote === 'APPROVE'
                                                  ? 'border-warm-primary bg-warm-primary/20 text-site-text'
                                                  : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                              } disabled:opacity-50`}
                                            >
                                              {courseVotingKey === `${course.id}:APPROVE` ? '...' : t('approve')}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => voteOnCourse(course.id, 'REJECT')}
                                              disabled={courseVotingKey !== null}
                                              className={`text-xs px-3 py-2 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                                                myVote === 'REJECT'
                                                  ? 'border-red-600/60 bg-red-600/20 text-site-text'
                                                  : 'border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text'
                                              } disabled:opacity-50`}
                                            >
                                              {courseVotingKey === `${course.id}:REJECT` ? '...' : t('reject')}
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
                        <div className="p-4 rounded-lg border border-site-border bg-site-secondary/30">
                          <div className="flex items-center gap-2 mb-2">
                            <UserPlus size={16} className="text-warm-accent" />
                            <div className="text-site-text font-semibold">{t('proposeCourseTitle')}</div>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            <input
                              value={courseForm.title}
                              onChange={(e) => setCourseForm((prev) => ({ ...prev, title: e.target.value }))}
                              placeholder={t('courseTitlePlaceholder')}
                              className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                            />
                            <textarea
                              value={courseForm.description}
                              onChange={(e) => setCourseForm((prev) => ({ ...prev, description: e.target.value }))}
                              placeholder={t('courseDescriptionPlaceholder')}
                              className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[90px]"
                            />
                            <div className="space-y-3">
                              <div className="text-sm text-site-text font-medium">{t('syllabusTitle')}</div>
                              <div className="space-y-2">
                                {courseForm.syllabus.map((item, index) => (
                                  <div key={`syllabus-${index}`} className="p-3 rounded-lg border border-site-border bg-site-secondary/30 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs text-site-muted">{t('chapterLabel', { index: index + 1 })}</div>
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
                                        className="text-gray-400 hover:text-gray-200 transition-all duration-200 hover:scale-110"
                                        title={t('remove')}
                                        aria-label={t('remove')}
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
                                      placeholder={t('chapterTitlePlaceholder')}
                                      className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
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
                                      placeholder={t('chapterDescriptionPlaceholder')}
                                      className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary min-h-[70px]"
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
                                  className="px-3 py-1 text-xs rounded-lg border border-site-border bg-site-secondary/30 hover:bg-site-secondary/50 text-site-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                                >
                                  {t('addChapter')}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={proposeCourse}
                              disabled={proposingCourse}
                              className="btn-primary disabled:opacity-50 pointer-events-auto relative z-20"
                            >
                              {proposingCourse ? '...' : t('sendProposal')}
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
        
        {/* بخش مبادلات استراتژیک سهام رای */}
        <div className="mt-12 relative z-[2000]">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 px-2 gap-4 relative z-30 pointer-events-none" style={{ isolation: 'isolate' }}>
            <h2 className="text-2xl font-bold text-site-text flex items-center gap-3 heading pointer-events-none">
              <ArrowRightLeft className="text-warm-primary" />
              {t('strategicExchanges')}
            </h2>
            <div className="flex bg-site-secondary/50 p-1 rounded-lg self-start md:self-auto pointer-events-auto relative z-[1000]" style={{ isolation: 'isolate' }}>
               <button 
                 onClick={() => setActiveStrategicTab('investments')}
                 className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 pointer-events-auto relative z-[1001] ${activeStrategicTab === 'investments' ? 'bg-warm-primary text-white shadow-md' : 'text-site-muted hover:text-site-text hover:shadow-sm'}`}
               >
                 {t('investment.title')}
               </button>
               <button 
                 onClick={() => setActiveStrategicTab('portfolio')}
                 className={`px-4 py-1.5 text-sm rounded-md transition-all duration-200 pointer-events-auto relative z-[1002] ${activeStrategicTab === 'portfolio' ? 'bg-warm-primary text-white shadow-md' : 'text-site-muted hover:text-site-text hover:shadow-sm'}`}
               >
                 {t('portfolio.title')}
               </button>
            </div>
          </div>
          
          {activeStrategicTab === 'investments' ? (
            <DomainInvestments />
          ) : (
            <DomainPortfolio />
          )}
        </div>

        {session?.user?.role === 'ADMIN' && <UserManagement />}
      </main>

      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-site-border">
              <h2 className="text-xl font-bold text-site-text">{t('addChildDomainTitle')}</h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label={t('close')}
                title={t('close')}
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-site-muted">
                {t('parentLabel')}: {addParentName || t('nonePlaceholder')}
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('nameRequiredLabel')}</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('slugOptionalLabel')}</label>
                <input
                  value={addForm.slug}
                  onChange={(e) => setAddForm((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  placeholder="auto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('descriptionOptionalLabel')}</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                  {t('cancel')}
                </button>
                <button type="button" onClick={createDomain} disabled={creating} className="btn-primary disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  {creating ? '...' : t('create')}
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
              <h2 className="text-xl font-bold text-site-text">{t('deleteDomainTitle')}</h2>
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
                <span>{t('deleteConfirmPrefix')}</span> <b>{selectedDomain.name}</b>
                <span>{t('deleteConfirmSuffix')}</span>
              </div>
              <div className="text-sm text-site-muted">
                {t('deleteRequirement')}
              </div>
              <div className="flex items-center gap-3 text-sm text-site-muted">
                <span className="border border-site-border rounded-full px-3 py-1">
                  {t('postsCount', { count: selectedDomain.counts.posts })}
                </span>
                <span className="border border-site-border rounded-full px-3 py-1">
                  {t('childrenCount', { count: selectedDomain.counts.children })}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setDeleteModalOpen(false)} className="btn-secondary transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                  {t('cancel')}
                </button>
                <button type="button" onClick={deleteDomain} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  {deleting ? '...' : t('delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {renameModalOpen && selectedDomain && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-site-secondary rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-site-border">
              <h2 className="text-xl font-bold text-site-text">{t('renameDomainTitle')}</h2>
              <button
                onClick={() => setRenameModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                aria-label={t('close')}
                title={t('close')}
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('currentNameLabel')}</label>
                <div className="w-full p-3 rounded-lg border border-site-border bg-site-secondary/30 text-site-muted">
                  {selectedDomain.name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-site-text mb-2">{t('newNameLabel')}</label>
                <input
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="w-full p-3 rounded-lg border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setRenameModalOpen(false)} className="btn-secondary transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                  {t('cancel')}
                </button>
                <button 
                  type="button" 
                  onClick={submitRenameProposal} 
                  disabled={loadingProposals || !renameName.trim() || renameName === selectedDomain.name} 
                  className="btn-primary disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  {loadingProposals ? '...' : t('submitProposal')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
