'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, X, Search, Shield, ShieldCheck, User, Edit } from 'lucide-react'
import { useTranslations } from 'next-intl'

type DomainStub = {
  id: string
  name: string
  slug: string
}

type UserWithDomains = {
  id: string
  name: string | null
  email: string | null
  role: string
  domainExperts: {
    id: string
    role: string
    domain: DomainStub
  }[]
  _count: {
    posts: number
    comments: number
    adminVotes: number
  }
}

type Props = {
  allDomains: DomainStub[]
}

export default function UserManagement({ allDomains }: Props) {
  const t = useTranslations('adminUsers')
  const [users, setUsers] = useState<UserWithDomains[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  
  // Modal state
  const [selectedUser, setSelectedUser] = useState<UserWithDomains | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [assignDomainId, setAssignDomainId] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data)
    } catch (error) {
      console.error(error)
      toast.error(t('toast.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const getGlobalRole = (user: UserWithDomains) => {
    const isGlobalExpert = user.domainExperts.some(de => de.domain.slug === 'philosophy')
    if (isGlobalExpert) return { label: t('roles.globalExpert'), color: 'text-red-400 bg-red-400/10 border-red-400/20' }
    
    if (user.domainExperts.length > 0) return { label: t('roles.domainExpert'), color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' }
    
    return { label: t('roles.editor'), color: 'text-gray-400 bg-gray-400/10 border-gray-400/20' }
  }

  const handleAssignDomain = async () => {
    if (!selectedUser || !assignDomainId) return

    // Check if already assigned
    if (selectedUser.domainExperts.some(de => de.domain.id === assignDomainId)) {
      toast.error(t('toast.alreadyAssigned'))
      return
    }

    try {
      setAssigning(true)
      const res = await fetch('/api/admin/domains/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: selectedUser.id, 
          domainId: assignDomainId,
          role: 'EXPERT' // Default role
        }),
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to assign domain')
      }

      toast.success(t('toast.assignSuccess'))
      await fetchUsers() // Refresh list
      
      // Update local selected user state to reflect changes immediately for the modal
      // But fetchUsers updates the main list. We need to re-find the user or close modal.
      // Better to refresh and update selectedUser from the new list.
      const updatedRes = await fetch('/api/admin/users', { cache: 'no-store' })
      const updatedUsers = await updatedRes.json()
      setUsers(updatedUsers)
      const updatedSelected = updatedUsers.find((u: UserWithDomains) => u.id === selectedUser.id)
      if (updatedSelected) setSelectedUser(updatedSelected)
      
      setAssignDomainId('')
    } catch (error: any) {
      toast.error(error.message || t('toast.assignFail'))
    } finally {
      setAssigning(false)
    }
  }

  const handleRemoveDomain = async (domainId: string) => {
    if (!selectedUser) return
    if (!confirm(t('confirmRemove'))) return

    try {
      const res = await fetch('/api/admin/domains/experts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: selectedUser.id, 
          domainId: domainId 
        }),
      })

      if (!res.ok) throw new Error('Failed to remove domain')

      toast.success(t('toast.removeSuccess'))
      
      // Refresh
      const updatedRes = await fetch('/api/admin/users', { cache: 'no-store' })
      const updatedUsers = await updatedRes.json()
      setUsers(updatedUsers)
      const updatedSelected = updatedUsers.find((u: UserWithDomains) => u.id === selectedUser.id)
      if (updatedSelected) setSelectedUser(updatedSelected)

    } catch (error) {
      toast.error(t('toast.removeFail'))
    }
  }

  const filteredUsers = users.filter(u => 
    (u.name?.toLowerCase().includes(search.toLowerCase()) || '') ||
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '')
  )

  return (
    <div className="card mt-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-site-text heading">{t('title')}</h2>
        <div className="relative">
          <input
            type="text"
            placeholder={t('search.placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text focus:outline-none focus:border-warm-primary text-sm w-64"
          />
          <Search className="absolute left-3 top-2.5 text-site-muted" size={16} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-site-muted">{t('loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-site-border text-site-muted text-sm">
                <th className="pb-3 pr-4 font-medium">{t('columns.user')}</th>
                <th className="pb-3 px-4 font-medium">{t('columns.email')}</th>
                <th className="pb-3 px-4 font-medium">{t('columns.role')}</th>
                <th className="pb-3 px-4 font-medium">{t('columns.domains')}</th>
                <th className="pb-3 pl-4 font-medium">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-border">
              {filteredUsers.map(user => {
                const roleInfo = getGlobalRole(user)
                return (
                  <tr key={user.id} className="group hover:bg-site-card/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-warm-primary/10 flex items-center justify-center text-warm-primary">
                          <User size={16} />
                        </div>
                        <span className="font-medium text-site-text">{user.name || t('user.noName')}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-site-muted text-sm">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleInfo.color}`}>
                        {roleInfo.label === t('roles.globalSupervisor') ? <ShieldCheck size={12} /> : roleInfo.label === t('roles.domainSupervisor') ? <Shield size={12} /> : null}
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {user.domainExperts.slice(0, 3).map(de => (
                          <span key={de.id} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                            {de.domain.name}
                          </span>
                        ))}
                        {user.domainExperts.length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                            +{user.domainExperts.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pl-4">
                      <button
                        onClick={() => {
                          setSelectedUser(user)
                          setIsModalOpen(true)
                        }}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        {t('assignDomains')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-site-muted">{t('emptySearch')}</div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-site-card border border-site-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-site-border bg-site-bg/50">
              <h3 className="font-bold text-lg text-site-text">{t('modal.title', { name: selectedUser.name || t('user.noName') })}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-site-muted hover:text-site-text">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {/* Current Domains */}
              <div>
                <h4 className="text-sm font-medium text-site-muted mb-3">{t('modal.currentDomains')}</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {selectedUser.domainExperts.length === 0 ? (
                    <p className="text-sm text-site-muted italic">{t('modal.noDomains')}</p>
                  ) : (
                    selectedUser.domainExperts.map(de => (
                      <div key={de.id} className="flex items-center justify-between p-2 rounded-lg bg-site-bg border border-site-border">
                        <span className="text-sm text-site-text">{de.domain.name}</span>
                        <button
                          onClick={() => handleRemoveDomain(de.domain.id)}
                          className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors"
                          title={t('modal.remove')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Domain */}
              <div className="pt-4 border-t border-site-border">
                <h4 className="text-sm font-medium text-site-muted mb-3">{t('modal.addDomain')}</h4>
                <div className="flex gap-2">
                  <select
                    value={assignDomainId}
                    onChange={(e) => setAssignDomainId(e.target.value)}
                    className="flex-1 bg-site-bg border border-site-border rounded-lg px-3 py-2 text-sm text-site-text focus:outline-none focus:border-warm-primary"
                  >
                    <option value="">{t('modal.selectDomain')}</option>
                    {allDomains
                      .filter(d => !selectedUser.domainExperts.some(de => de.domain.id === d.id))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))
                    }
                  </select>
                  <button
                    onClick={handleAssignDomain}
                    disabled={!assignDomainId || assigning}
                    className="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {assigning ? t('loadingShort') : t('modal.add')}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-site-bg/50 border-t border-site-border text-right">
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-sm text-site-muted hover:text-site-text"
              >
                {t('modal.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
