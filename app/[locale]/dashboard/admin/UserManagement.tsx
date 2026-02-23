'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { Search, Shield, User, Crown } from 'lucide-react'
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
    wing: string
    domain: DomainStub
  }[]
  _count: {
    posts: number
    comments: number
    adminVotes: number
  }
}

type Props = {}

export default function UserManagement({}: Props) {
  const t = useTranslations('adminUsers')
  const [users, setUsers] = useState<UserWithDomains[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  
  const fetchUsers = useCallback(async () => {
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
  }, [t])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const getGlobalRole = (user: UserWithDomains) => {
    if (user.domainExperts.some(de => de.role === 'HEAD')) {
      return { label: t('roles.head'), color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' }
    }
    if (user.domainExperts.length > 0) return { label: t('roles.domainExpert'), color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' }
    
    return { label: t('roles.editor'), color: 'text-site-muted bg-site-secondary/30 border-site-border' }
  }

  const filteredUsers = useMemo(() => users.filter(u => 
    (u.name?.toLowerCase().includes(search.toLowerCase()) || '') ||
    (u.email?.toLowerCase().includes(search.toLowerCase()) || '')
  ), [users, search])

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
            className="pl-10 pr-4 py-2 rounded-lg bg-site-bg border border-site-border text-site-text focus:outline-none focus:border-warm-primary text-sm w-64 transition-all duration-200 hover:border-warm-primary/50 focus:shadow-sm"
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
                <th className="pb-3 pl-4 font-medium">{t('columns.domains')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-border">
              {filteredUsers.map(user => {
                const roleInfo = getGlobalRole(user)
                return (
                  <tr key={user.id} className="group hover:bg-site-card/50 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 border-b border-site-border last:border-0">
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
                        {roleInfo.label === t('roles.head') ? <Crown size={12} /> : roleInfo.label === t('roles.domainExpert') ? <Shield size={12} /> : null}
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="py-3 pl-4">
                      <div className="flex flex-wrap gap-2">
                        {user.domainExperts.map(de => (
                          <div 
                            key={de.id} 
                            className="flex flex-col gap-0.5 px-2 py-1 rounded bg-site-secondary/20 border border-site-border text-[10px] transition-all duration-200 hover:bg-site-secondary/30 hover:scale-105"
                          >
                            <div className="flex items-center gap-1 justify-between">
                              <span className="font-bold text-site-text">{de.domain.name}</span>
                              {de.role === 'HEAD' && <Crown size={10} className="text-amber-500" />}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={de.wing === 'RIGHT' ? 'text-blue-400' : 'text-green-400'}>
                                {t(`wings.${de.wing.toLowerCase()}`)}
                              </span>
                              <span className="text-site-muted opacity-75">
                                {de.role === 'HEAD' ? t('roles.head') : t('roles.domainExpert')}
                              </span>
                            </div>
                          </div>
                        ))}
                        {user.domainExperts.length === 0 && (
                          <span className="text-site-muted text-xs">-</span>
                        )}
                      </div>
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
    </div>
  )
}
