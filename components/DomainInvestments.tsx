'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { Check, X, TrendingUp, Percent, Clock, ArrowUpRight, ArrowDownLeft, Shield, Calendar, XCircle } from 'lucide-react'

type Domain = {
  id: string
  name: string
  slug: string
}

type Investment = {
  id: string
  proposerDomainId: string
  targetDomainId: string
  investedDomainId?: string | null
  proposerWing: string
  targetWing: string
  percentageInvested: number
  percentageReturn: number
  durationYears: number
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'RETURNED' | 'REJECTED'
  proposerDomain: Domain
  targetDomain: Domain
  startDate?: string
  endDate?: string
  createdAt: string
  stats?: {
    proposer: { total: number; approved: number; rejected: number }
    target: { total: number; approved: number; rejected: number }
  }
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
  const t = useTranslations('admin.dashboard')
  const { data: session } = useSession()
  const [allDomains, setAllDomains] = useState<Domain[]>([])
  const [selectedMyDomainId, setSelectedMyDomainId] = useState('')
  const [proposerWing, setProposerWing] = useState('RIGHT')
  const [selectedTargetDomainId, setSelectedTargetDomainId] = useState('')
  const [targetWing, setTargetWing] = useState('RIGHT')
  const [investPercent, setInvestPercent] = useState(10)
  const [returnPercent, setReturnPercent] = useState(1)
  const [endDate, setEndDate] = useState('')
  const [sourceDomainId, setSourceDomainId] = useState('')
  
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [historyLimit, setHistoryLimit] = useState(10)
  const [showHistory, setShowHistory] = useState(false)

  const sortedInvestments = useMemo(() => {
    if (!investments) return []
    return [...investments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [investments])

  const shortId = useCallback((id: string) => {
    const index = sortedInvestments.findIndex(i => i.id === id)
    return index + 1
  }, [sortedInvestments])

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

  useEffect(() => {
    setSourceDomainId(selectedMyDomainId)
  }, [selectedMyDomainId])

  const availableAssets = useMemo(() => {
    if (!selectedMyDomainId) return []
    const balances: Record<string, number> = {}
    
    investments.forEach(inv => {
      if (inv.status !== 'ACTIVE') return

      // Incoming (I received power)
      if (inv.targetDomainId === selectedMyDomainId && inv.targetWing === proposerWing) {
         const currency = inv.investedDomainId || inv.proposerDomainId
         balances[currency] = (balances[currency] || 0) + inv.percentageInvested
      }
      
      // Outgoing (I gave power)
      if (inv.proposerDomainId === selectedMyDomainId && inv.proposerWing === proposerWing) {
         const currency = inv.investedDomainId || inv.proposerDomainId
         balances[currency] = (balances[currency] || 0) - inv.percentageInvested
      }
    })
    
    return Object.entries(balances)
      .filter(([id, bal]) => id !== selectedMyDomainId && bal > 0.0001) // Exclude own shares & zero balance
      .map(([id, bal]) => {
        const domain = allDomains.find(d => d.id === id)
        return {
          id,
          name: domain?.name || 'Unknown',
          balance: bal
        }
      })
  }, [investments, selectedMyDomainId, proposerWing, allDomains])

  const handlePropose = useCallback(async () => {
    if (!selectedMyDomainId || !selectedTargetDomainId || !endDate) {
      toast.error(t('investment.toast.createError'))
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
          endDate: endDate,
          proposerWing,
          targetWing,
          investedDomainId: sourceDomainId === selectedMyDomainId ? null : sourceDomainId
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
  }, [selectedMyDomainId, selectedTargetDomainId, investPercent, returnPercent, endDate, proposerWing, targetWing, sourceDomainId, t, fetchData]);

  const handleVote = useCallback(async (id: string, vote: 'APPROVE' | 'REJECT') => {
    try {
      setVotingId(`${id}:${vote}`)
      const res = await fetch('/api/admin/domains/investments/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentId: id, vote })
      })
      if (res.ok) {
        toast.success(t('voteRecorded'))
        fetchData()
      } else {
        const data = await res.json()
        toast.error(data.error || t('voteError'))
      }
    } catch (e) {
      toast.error(t('voteError'))
    } finally {
      setVotingId(null)
    }
  }, [t, fetchData]);

  const handleSettle = useCallback(async () => {
    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/domains/investments/settle', {
        method: 'POST'
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(t('investment.settleSuccess', { count: data.results.length }))
        fetchData()
      } else {
        toast.error(t('investment.settleError'))
      }
    } catch (e) {
      toast.error(t('investment.settleError'))
    } finally {
      setSubmitting(false)
    }
  }, [fetchData, t]);

  const handleForceTerminate = useCallback(async (id: string) => {
    if (!confirm(t('investment.confirmTerminate'))) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/domains/investments/force-terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentId: id })
      })
      if (res.ok) {
        toast.success(t('investment.terminateSuccess'))
        fetchData()
      } else {
        const d = await res.json()
        toast.error(d.error || t('investment.terminateError'))
      }
    } catch (e) {
      toast.error(t('investment.terminateError'))
    } finally {
      setSubmitting(false)
    }
  }, [t, fetchData]);

  if (loading) {
    return <div className="p-8 text-center text-site-muted animate-pulse">...</div>
  }

  return (
    <div className="space-y-8">
      {/* Propose Form */}
      <div className="card border-warm-primary/20 bg-site-secondary/20">
        <h3 className="text-lg font-bold text-site-text mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-warm-primary" />
          {t('investment.propose')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <label className="text-xs text-site-muted px-1">{t('wingLabel')}</label>
            <select 
              value={proposerWing} 
              onChange={e => setProposerWing(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-bg text-site-text text-sm focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value="RIGHT">{t('rightWing')}</option>
              <option value="LEFT">{t('leftWing')}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.sourceOfFunds')}</label>
            <select 
              value={sourceDomainId} 
              onChange={e => setSourceDomainId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-bg text-site-text text-sm focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value={selectedMyDomainId}>{t('investment.ownShares', { name: allDomains.find(d => d.id === selectedMyDomainId)?.name || '' })}</option>
              {availableAssets.map(asset => (
                <option key={asset.id} value={asset.id}>
                  {t('investment.assetItem', { name: asset.name, balance: asset.balance.toFixed(2) })}
                </option>
              ))}
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
            <label className="text-xs text-site-muted px-1">{t('wingLabel')}</label>
            <select 
              value={targetWing} 
              onChange={e => setTargetWing(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-bg text-site-text text-sm focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value="RIGHT">{t('rightWing')}</option>
              <option value="LEFT">{t('leftWing')}</option>
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
          <div className="space-y-1">
            <label className="text-xs text-site-muted px-1">{t('investment.duration')}</label>
            <div className="relative">
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full p-2.5 pr-8 rounded-lg border border-site-border bg-site-bg text-site-text text-sm outline-none"
              />
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-muted" />
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
          {t('investment.parentChildOnly')}
        </p>
      </div>
      {/* Pending Proposals */}
      {investments.filter(i => i.status === 'PENDING').length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-site-text flex items-center gap-2">
            <Clock size={20} className="text-warm-accent" />
            {t('investment.statusPending')}
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {investments.filter(i => i.status === 'PENDING').map(inv => (
              <div key={inv.id} className="p-4 rounded-xl border border-site-border bg-site-secondary/30 flex flex-col md:flex-row gap-4">
                {/* Left Side: Contract Details */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="text-site-text font-bold text-sm">
                        {t('investment.investmentDirection', { 
                          proposer: inv.proposerDomain.name, 
                          target: inv.targetDomain.name 
                        })}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-site-muted">
                        <span>{t('wings.' + inv.proposerWing.toLowerCase())}</span>
                        <ArrowUpRight size={12} className="text-warm-primary" />
                        <span>{t('wings.' + inv.targetWing.toLowerCase())}</span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-site-bg px-2 py-0.5 rounded-full border border-site-border text-site-muted whitespace-nowrap">
                      {new Date(inv.createdAt).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-site-bg/50 p-2 rounded border border-site-border/30">
                      <div className="text-site-muted mb-1">{t('investment.give')}</div>
                      <div className="text-warm-primary font-bold">{inv.percentageInvested}%</div>
                    </div>
                    <div className="bg-site-bg/50 p-2 rounded border border-site-border/30">
                      <div className="text-site-muted mb-1">{t('investment.receive')}</div>
                      <div className="text-warm-accent font-bold">{inv.percentageReturn}%</div>
                    </div>
                    <div className="bg-site-bg/50 p-2 rounded border border-site-border/30">
                      <div className="text-site-muted mb-1">{t('investment.endDate')}</div>
                      <div className="text-site-text font-bold">
                        {inv.endDate ? new Date(inv.endDate).toLocaleDateString('en-GB') : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleVote(inv.id, 'APPROVE')}
                      disabled={!!votingId}
                      className="flex-1 py-2 rounded-lg bg-warm-primary/20 hover:bg-warm-primary/30 text-warm-primary border border-warm-primary/30 text-xs font-bold transition-colors"
                    >
                      {votingId === inv.id + ':APPROVE' ? '...' : t('investment.returnBtn')}
                    </button>
                    <button 
                      onClick={() => handleVote(inv.id, 'REJECT')}
                      disabled={!!votingId}
                      className="flex-1 py-2 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/20 text-xs font-bold transition-colors"
                    >
                      {votingId === inv.id + ':REJECT' ? '...' : t('reject')}
                    </button>
                  </div>
                </div>

                {/* Right Side: Voting Stats */}
                {inv.stats && (
                  <div className="w-full md:w-64 flex flex-col gap-2 border-t md:border-t-0 md:border-r border-site-border/30 pt-4 md:pt-0 md:pr-4 md:mr-4 order-first md:order-last bg-site-bg/20 p-3 rounded-lg">
                    <div className="text-xs font-bold text-site-muted mb-1">{t('portfolio.title')}</div>
                    
                    {/* Proposer Stats */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-site-muted">
                        <span>{inv.proposerDomain.name} ({t('wings.' + inv.proposerWing.toLowerCase())})</span>
                        <span>{inv.stats.proposer.approved}/{inv.stats.proposer.total}</span>
                      </div>
                      <div className="h-1.5 bg-site-bg rounded-full overflow-hidden flex">
                        <div 
                          className="bg-green-500" 
                          style={{ width: (inv.stats.proposer.approved / inv.stats.proposer.total) * 100 + '%' }}
                        />
                        <div 
                          className="bg-red-500" 
                          style={{ width: (inv.stats.proposer.rejected / inv.stats.proposer.total) * 100 + '%' }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-site-muted/70">
                        <span>{inv.stats.proposer.total} members</span>
                        <span>{inv.stats.proposer.approved + inv.stats.proposer.rejected} voted</span>
                      </div>
                    </div>

                    <div className="h-px bg-site-border/30 my-1" />

                    {/* Target Stats */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-site-muted">
                        <span>{inv.targetDomain.name} ({t('wings.' + inv.targetWing.toLowerCase())})</span>
                        <span>{inv.stats.target.approved}/{inv.stats.target.total}</span>
                      </div>
                      <div className="h-1.5 bg-site-bg rounded-full overflow-hidden flex">
                        <div 
                          className="bg-green-500" 
                          style={{ width: (inv.stats.target.approved / inv.stats.target.total) * 100 + '%' }}
                        />
                        <div 
                          className="bg-red-500" 
                          style={{ width: (inv.stats.target.rejected / inv.stats.target.total) * 100 + '%' }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-site-muted/70">
                        <span>{inv.stats.target.total} members</span>
                        <span>{inv.stats.target.approved + inv.stats.target.rejected} voted</span>
                      </div>
                    </div>
                  </div>
                )}
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
                <th className="px-4 py-3 font-medium text-center">#</th>
                <th className="px-4 py-3 font-medium">{t('investment.proposer')}</th>
                <th className="px-4 py-3 font-medium">{t('investment.target')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.tableGive')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.tableReceive')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.startDate')}</th>
                <th className="px-4 py-3 font-medium">{t('investment.endDate')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('investment.status')}</th>
                {session?.user?.role === 'ADMIN' && (
                  <th className="px-4 py-3 font-medium text-center">{t('investment.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-site-border/50">
              {investments.filter(i => i.status === 'ACTIVE').length === 0 ? (
                <tr><td colSpan={session?.user?.role === 'ADMIN' ? 9 : 8} className="px-4 py-8 text-center text-site-muted italic">{t('investment.noItems')}</td></tr>
              ) : (
                investments.filter(i => i.status === 'ACTIVE').map(inv => (
                  <tr key={inv.id} className="hover:bg-site-secondary/20 transition-colors">
                    <td className="px-4 py-4 text-center font-mono text-xs text-site-muted select-all">
                      {shortId(inv.id)}
                    </td>
                    <td className="px-4 py-4 font-medium text-site-text">
                      <div>{inv.proposerDomain.name}</div>
                      <div className="text-xs text-site-muted font-normal">{t('wings.' + inv.proposerWing.toLowerCase())}</div>
                    </td>
                    <td className="px-4 py-4 font-medium text-site-text">
                      <div>{inv.targetDomain.name}</div>
                      <div className="text-xs text-site-muted font-normal">{t('wings.' + inv.targetWing.toLowerCase())}</div>
                    </td>
                    <td className="px-4 py-4 text-center text-site-muted font-bold text-orange-400">{inv.percentageInvested}%</td>
                    <td className="px-4 py-4 text-center text-site-muted font-bold text-emerald-400">{inv.percentageReturn}%</td>
                    <td className="px-4 py-4 text-center text-xs text-site-muted">
                      {inv.startDate ? new Date(inv.startDate).toLocaleDateString('en-GB') : (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-GB') : '-')}
                    </td>
                    <td className="px-4 py-4 text-xs text-site-muted">
                      {inv.endDate ? new Date(inv.endDate).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                        <Check size={10} /> {t('investment.statusActive')}
                      </span>
                    </td>
                    {session?.user?.role === 'ADMIN' && (
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => handleForceTerminate(inv.id)}
                          disabled={submitting}
                          className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                          title={t('investment.forceTerminate')}
                        >
                          <XCircle size={18} />
                        </button>
                      </td>
                    )}
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
              {t('investment.settleExpired')}
            </button>
          </div>
        )}
      </div>

      {/* History (Completed/Returned) */}
      <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-site-text flex items-center gap-2">
              <Clock size={20} className="text-site-muted" />
              {t('investment.history')}
            </h3>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 text-sm font-medium text-site-text bg-site-secondary/20 hover:bg-site-secondary/30 rounded-lg transition-colors border border-site-border"
            >
              {showHistory ? t('investment.hideHistory') : t('investment.showHistory')}
            </button>
          </div>
          
          {showHistory && (
          <div className="overflow-hidden rounded-xl border border-site-border bg-site-secondary/10">
            <table className="w-full text-sm text-right">
              <thead className="bg-site-secondary/50 text-site-muted text-xs border-b border-site-border">
                <tr>
                  <th className="px-4 py-3 font-medium text-center">#</th>
                  <th className="px-4 py-3 font-medium">{t('investment.proposer')}</th>
                  <th className="px-4 py-3 font-medium">{t('investment.target')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('investment.tableGive')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('investment.tableReceive')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('investment.startDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('investment.endDate')}</th>
                  <th className="px-4 py-3 font-medium text-center">{t('investment.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-site-border/50">
                {investments.filter(i => ['COMPLETED', 'RETURNED'].includes(i.status)).length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-site-muted italic">{t('investment.noItems')}</td></tr>
                ) : (
                  investments
                    .filter(i => ['COMPLETED', 'RETURNED'].includes(i.status))
                    .sort((a, b) => new Date(b.endDate || b.createdAt).getTime() - new Date(a.endDate || a.createdAt).getTime())
                    .slice(0, historyLimit)
                    .map(inv => (
                    <tr key={inv.id} className="hover:bg-site-secondary/20 transition-colors opacity-75 hover:opacity-100">
                      <td className="px-4 py-4 text-center font-mono text-xs text-site-muted select-all">
                        {shortId(inv.id)}
                      </td>
                      <td className="px-4 py-4 font-medium text-site-text">
                        <div>{inv.proposerDomain.name}</div>
                        <div className="text-xs text-site-muted font-normal">{t('wings.' + inv.proposerWing.toLowerCase())}</div>
                      </td>
                      <td className="px-4 py-4 font-medium text-site-text">
                        <div>{inv.targetDomain.name}</div>
                        <div className="text-xs text-site-muted font-normal">{t('wings.' + inv.targetWing.toLowerCase())}</div>
                      </td>
                      <td className="px-4 py-4 text-center text-site-muted">{inv.percentageInvested}%</td>
                      <td className="px-4 py-4 text-center text-site-muted">{inv.percentageReturn}%</td>
                      <td className="px-4 py-4 text-center text-xs text-site-muted">
                        {inv.startDate ? new Date(inv.startDate).toLocaleDateString('en-GB') : (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-GB') : '-')}
                      </td>
                      <td className="px-4 py-4 text-xs text-site-muted">
                        {inv.endDate ? new Date(inv.endDate).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                          inv.status === 'COMPLETED' 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                            : 'bg-site-secondary text-site-muted border-site-border'
                        }`}>
                          {inv.status === 'COMPLETED' ? t('investment.statusCompleted') : t('investment.statusReturned')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            
            {investments.filter(i => ['COMPLETED', 'RETURNED'].includes(i.status)).length > historyLimit && (
              <div className="p-4 flex justify-center border-t border-site-border">
                <button 
                  onClick={() => setHistoryLimit(prev => prev + 10)}
                  className="px-4 py-2 text-sm text-site-muted hover:text-site-text bg-site-secondary/30 hover:bg-site-secondary/50 rounded-lg transition-colors"
                >
                  {t('investment.loadMore')}
                </button>
              </div>
            )}
  </div>
          )}
        </div>

    </div>
  )

}
