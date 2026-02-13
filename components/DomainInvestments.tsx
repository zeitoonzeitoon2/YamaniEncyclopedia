'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { Check, X, TrendingUp, Percent, Clock, ArrowUpRight, ArrowDownLeft, Shield } from 'lucide-react'

type Domain = {
  id: string
  name: string
  slug: string
}

type Investment = {
  id: string
  proposerDomainId: string
  targetDomainId: string
  percentageInvested: number
  percentageReturn: number
  durationYears: number
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'RETURNED' | 'REJECTED'
  proposerDomain: Domain
  targetDomain: Domain
  startDate?: string
  endDate?: string
  createdAt: string
  votes: {
    id: string
    voterId: string
    vote: 'APPROVE' | 'REJECT'
    domainId: string
  }[]
}

const flattenTree = (nodes: any[]): Domain[] => {
  let result: Domain[] = []
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, slug: node.slug })
    if (node.children && node.children.length > 0) {
      result = [...result, ...flattenTree(node.children)]
    }
  }
  return result
}

export default function DomainInvestments() {
  const t = useTranslations('adminCourses')
  const { data: session } = useSession()
  const [allDomains, setAllDomains] = useState<Domain[]>([])
  const [selectedMyDomainId, setSelectedMyDomainId] = useState('')
  const [selectedTargetDomainId, setSelectedTargetDomainId] = useState('')
  const [investPercent, setInvestPercent] = useState(10)
  const [returnPercent, setReturnPercent] = useState(1)
  const [duration, setDuration] = useState(1)
  
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const domainsRes = await fetch('/api/admin/domains')
      const domainsData = await domainsRes.json()
      if (domainsRes.ok) {
        const domains = domainsData.roots ? flattenTree(domainsData.roots) : (domainsData.domains || [])
        setAllDomains(domains)
      }

      const invRes = await fetch('/api/admin/domains/investments')
      const invData = await invRes.json()
      if (invRes.ok) {
        setInvestments(invData.investments || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePropose = useCallback(async () => {
    if (!selectedMyDomainId || !selectedTargetDomainId) {
      toast.error('لطفاً حوزه‌ها را انتخاب کنید')
      return
    }
    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/domains/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposerDomainId: selectedMyDomainId,
          targetDomainId: selectedTargetDomainId,
          percentageInvested: investPercent,
          percentageReturn: returnPercent,
          durationYears: duration
        })
      })
      if (res.ok) {
        toast.success(t('investment.toast.createSuccess'))
        fetchData()
      } else {
        const d = await res.json()
        toast.error(d.error || t('investment.toast.createError'))
      }
    } catch (e) {
      toast.error(t('investment.toast.createError'))
    } finally {
      setSubmitting(false)
    }
  }, [selectedMyDomainId, selectedTargetDomainId, investPercent, returnPercent, duration, t, fetchData])

  const handleVote = useCallback(async (id: string, vote: 'APPROVE' | 'REJECT') => {
    try {
      setVotingId(`${id}:${vote}`)
      const res = await fetch('/api/admin/domains/investments/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentId: id, vote })
      })
      if (res.ok) {
        toast.success(t('updateSuccess'))
        fetchData()
      } else {
        const data = await res.json()
        toast.error(data.error || t('updateError'))
      }
    } catch (e) {
      toast.error(t('updateError'))
    } finally {
      setVotingId(null)
    }
  }, [t, fetchData])

  const handleSettle = useCallback(async () => {
    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/domains/investments/settle', {
        method: 'POST'
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.results.length} سرمایه‌گذاری تسویه شد`)
        fetchData()
      } else {
        toast.error('خطا در تسویه سرمایه‌گذاری‌ها')
      }
    } catch (e) {
      toast.error('خطا در ارتباط با سرور')
    } finally {
      setSubmitting(false)
    }
  }, [fetchData])

  if (loading) return <div className="p-8 text-center text-site-muted animate-pulse">...</div>

  return (
    <div className="space-y-8">
      {/* Propose Form */}
      <div className="card border-warm-primary/20 bg-site-secondary/20">
        <h3 className="text-lg font-bold text-site-text mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-warm-primary" />
          {t('investment.propose')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.proposer')}</label>
            <select 
              value={selectedMyDomainId} 
              onChange={e => setSelectedMyDomainId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-bg text-site-text text-sm focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value="">{t('investment.title')}...</option>
              {allDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.target')}</label>
            <select 
              value={selectedTargetDomainId} 
              onChange={e => setSelectedTargetDomainId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-bg text-site-text text-sm focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value="">{t('investment.target')}...</option>
              {allDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.give')}</label>
            <div className="relative">
              <input 
                type="number" 
                value={investPercent} 
                onChange={e => setInvestPercent(Number(e.target.value))}
                className="w-full p-2.5 pr-8 rounded-lg border border-site-border bg-site-bg text-site-text text-sm outline-none"
              />
              <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-muted" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.receive')}</label>
            <div className="relative">
              <input 
                type="number" 
                value={returnPercent} 
                onChange={e => setReturnPercent(Number(e.target.value))}
                className="w-full p-2.5 pr-8 rounded-lg border border-site-border bg-site-bg text-site-text text-sm outline-none"
              />
              <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-muted" />
            </div>
          </div>
          <div className="flex items-end">
            <button 
              onClick={handlePropose}
              disabled={submitting}
              className="w-full btn-primary h-[42px] flex items-center justify-center gap-2"
            >
              {submitting ? '...' : <><TrendingUp size={18}/> {t('investment.propose')}</>}
            </button>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-site-muted bg-site-bg/50 p-2 rounded border border-site-border/50">
          💡 {t('investment.duration')}: {duration} {t('investment.durationValue', { years: duration })}. 
          فقط بین والد و فرزند مستقیم امکان‌پذیر است.
        </p>
      </div>

      {/* Pending Proposals */}
      {investments.filter(i => i.status === 'PENDING').length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-site-text flex items-center gap-2">
            <Clock size={20} className="text-warm-accent" />
            {t('investment.statusPending')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {investments.filter(i => i.status === 'PENDING').map(inv => (
              <div key={inv.id} className="p-4 rounded-xl border border-site-border bg-site-secondary/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-site-text font-bold">
                    <span>{inv.proposerDomain.name}</span>
                    <ArrowUpRight size={16} className="text-warm-primary" />
                    <span>{inv.targetDomain.name}</span>
                  </div>
                  <span className="text-[10px] bg-site-bg px-2 py-0.5 rounded-full border border-site-border text-site-muted">
                    {new Date(inv.createdAt).toLocaleDateString('fa-IR')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-site-bg/50 p-2 rounded border border-site-border/30">
                    <div className="text-site-muted mb-1">{t('investment.give')}</div>
                    <div className="text-warm-primary font-bold">{inv.percentageInvested}%</div>
                  </div>
                  <div className="bg-site-bg/50 p-2 rounded border border-site-border/30">
                    <div className="text-site-muted mb-1">{t('investment.receive')}</div>
                    <div className="text-warm-accent font-bold">{inv.percentageReturn}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleVote(inv.id, 'APPROVE')}
                    disabled={!!votingId}
                    className="flex-1 py-2 rounded-lg bg-warm-primary/20 hover:bg-warm-primary/30 text-warm-primary border border-warm-primary/30 text-xs font-bold transition-colors"
                  >
                    {votingId === `${inv.id}:APPROVE` ? '...' : t('investment.returnBtn')}
                  </button>
                  <button 
                    onClick={() => handleVote(inv.id, 'REJECT')}
                    disabled={!!votingId}
                    className="flex-1 py-2 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/20 text-xs font-bold transition-colors"
                  >
                    {votingId === `${inv.id}:REJECT` ? '...' : t('reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Investments */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-site-text flex items-center gap-2">
          <Shield size={20} className="text-site-muted" />
          {t('investment.statusActive')}
        </h3>
        <div className="overflow-hidden rounded-xl border border-site-border bg-site-secondary/20">
          <table className="w-full text-sm text-right">
            <thead className="bg-site-secondary/50 text-site-muted text-xs border-b border-site-border">
              <tr>
                <th className="px-4 py-3 font-medium">{t('investment.proposer')}</th>
                <th className="px-4 py-3 font-medium">{t('investment.target')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.give')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.receive')}</th>
                <th className="px-4 py-3 font-medium">{t('investment.endDate')}</th>
                <th className="px-4 py-3 font-medium text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-site-border/50">
              {investments.filter(i => i.status === 'ACTIVE').length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-site-muted italic">موردی یافت نشد</td></tr>
              ) : (
                investments.filter(i => i.status === 'ACTIVE').map(inv => (
                  <tr key={inv.id} className="hover:bg-site-secondary/30 transition-colors">
                    <td className="px-4 py-4 font-medium text-site-text">{inv.proposerDomain.name}</td>
                    <td className="px-4 py-4 font-medium text-site-text">{inv.targetDomain.name}</td>
                    <td className="px-4 py-4 text-center text-warm-primary font-bold">{inv.percentageInvested}%</td>
                    <td className="px-4 py-4 text-center text-warm-accent font-bold">{inv.percentageReturn}%</td>
                    <td className="px-4 py-4 text-xs text-site-muted">
                      {inv.endDate ? new Date(inv.endDate).toLocaleDateString('fa-IR') : '-'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                        <Check size={10} /> {t('investment.statusActive')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {investments.filter(i => i.status === 'ACTIVE').some(i => i.endDate && new Date(i.endDate) <= new Date()) && (
          <div className="flex justify-center pt-2">
            <button 
              onClick={handleSettle}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-warm-primary text-white text-sm font-bold shadow-lg shadow-warm-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Clock size={18} />
              تسویه موارد منقضی شده
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
