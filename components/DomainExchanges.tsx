'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { Check, X, ArrowRightLeft, Percent, Shield, TrendingUp, Vote } from 'lucide-react'

type Domain = {
  id: string
  name: string
  slug: string
}

type VotingShare = {
  id: string
  domainId: string
  ownerDomainId: string
  percentage: number
  domain: Domain
  ownerDomain: Domain
}

type ExchangeProposal = {
  id: string
  proposerDomainId: string
  targetDomainId: string
  percentageProposerToTarget: number
  percentageTargetToProposer: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED'
  proposerDomain: Domain
  targetDomain: Domain
  createdAt: string
  votes: {
    id: string
    voterId: string
    vote: 'APPROVE' | 'REJECT'
    domainId: string
  }[]
  stats?: {
    proposerExperts: number
    targetExperts: number
    proposerVotes: number
    targetVotes: number
  }
}

export default function DomainExchanges() {
  const t = useTranslations('voting')
  const { data: session } = useSession()
  const [userDomains, setUserDomains] = useState<Domain[]>([])
  const [allDomains, setAllDomains] = useState<Domain[]>([])
  const [selectedMyDomainId, setSelectedMyDomainId] = useState('')
  const [selectedTargetDomainId, setSelectedTargetDomainId] = useState('')
  const [givePercent, setGivePercent] = useState(0)
  const [receivePercent, setReceivePercent] = useState(0)
  
  const [sharesInMyDomain, setSharesInMyDomain] = useState<VotingShare[]>([])
  const [mySharesInOthers, setMySharesInOthers] = useState<VotingShare[]>([])
  const [pendingProposals, setPendingProposals] = useState<ExchangeProposal[]>([])
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      // 1. Fetch user's domains
      const domainsRes = await fetch('/api/admin/domains')
      const domainsData = await domainsRes.json()
      
      if (domainsRes.ok) {
        setAllDomains(domainsData.domains || [])
        // Filter domains where user is expert/head
        // We might need a separate API for this or check the data
        // For now, let's assume we can see all but only act for ours
        // In a real scenario, the backend handles the permission
        
        // Let's get the expert domains from a specialized endpoint if exists
        // or just use the session if it has them.
        // For now, let's fetch proposals which will also give us context
      }

      const proposalsRes = await fetch('/api/admin/domains/exchanges')
      const proposalsData = await proposalsRes.json()
      if (proposalsRes.ok) {
        setPendingProposals(proposalsData.proposals || [])
      }

      // If a domain is selected, fetch its shares
      if (selectedMyDomainId) {
        // We'll need endpoints for these
        const sharesRes = await fetch(`/api/admin/domains/${selectedMyDomainId}/shares`)
        const sharesData = await sharesRes.json()
        if (sharesRes.ok) {
          setSharesInMyDomain(sharesData.sharesInDomain || [])
          setMySharesInOthers(sharesData.ownedShares || [])
        }
      }
    } catch (error) {
      console.error('Error fetching voting data:', error)
      toast.error(t('loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedMyDomainId])

  const handlePropose = async () => {
    if (!selectedMyDomainId || !selectedTargetDomainId) {
      toast.error(t('selectTargetDomain'))
      return
    }
    
    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/domains/exchanges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposerDomainId: selectedMyDomainId,
          targetDomainId: selectedTargetDomainId,
          percentageProposerToTarget: givePercent,
          percentageTargetToProposer: receivePercent
        })
      })
      
      const data = await res.json()
      if (res.ok) {
        toast.success(t('proposeSuccess'))
        setGivePercent(0)
        setReceivePercent(0)
        setSelectedTargetDomainId('')
        fetchData()
      } else {
        toast.error(data.error || t('loadError'))
      }
    } catch (error) {
      toast.error(t('loadError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVote = async (proposalId: string, vote: 'APPROVE' | 'REJECT') => {
    try {
      setVotingId(proposalId)
      const res = await fetch('/api/admin/domains/exchanges/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, vote })
      })
      
      const data = await res.json()
      if (res.ok) {
        toast.success(t('voteSuccess'))
        fetchData()
      } else {
        toast.error(data.error || t('loadError'))
      }
    } catch (error) {
      toast.error(t('loadError'))
    } finally {
      setVotingId(null)
    }
  }

  // Find domains where user is an expert to populate selectedMyDomainId
  useEffect(() => {
    if (allDomains.length > 0 && session?.user?.id) {
      // In a real app, we'd check if the user is an expert in these domains
      // For this demo, let's just use all domains the user might belong to
      // or just show all domains and let the backend validate.
      setUserDomains(allDomains) // Simplified for now
      if (!selectedMyDomainId && allDomains.length > 0) {
        setSelectedMyDomainId(allDomains[0].id)
      }
    }
  }, [allDomains, session])

  if (loading && allDomains.length === 0) {
    return <div className="p-8 text-center text-site-muted">{t('loading')}</div>
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-6 bg-site-card/50 backdrop-blur-sm border-warm-primary/10">
            <label className="block text-sm font-medium text-site-muted mb-2 flex items-center gap-2">
              <Shield size={16} className="text-warm-primary" />
              {t('selectProposerDomain')}
            </label>
            <select
              value={selectedMyDomainId}
              onChange={(e) => setSelectedMyDomainId(e.target.value)}
              className="w-full bg-site-bg border border-site-border rounded-lg px-4 py-2.5 text-site-text focus:ring-2 focus:ring-warm-primary outline-none transition-all"
            >
              {allDomains.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            
            <div className="mt-6 p-4 rounded-xl bg-warm-primary/5 border border-warm-primary/10">
              <div className="text-xs text-site-muted mb-1">{t('votingPower')}</div>
              <div className="text-2xl font-bold text-warm-primary flex items-baseline gap-1">
                {sharesInMyDomain.find(s => s.ownerDomainId === selectedMyDomainId)?.percentage || 100}
                <span className="text-sm font-medium">%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 card p-6 bg-site-card/50 backdrop-blur-sm border-warm-primary/10">
          <h3 className="text-lg font-bold text-site-text mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-warm-primary" />
            {t('currentPowerDistribution')}
          </h3>
          <div className="space-y-3">
            {sharesInMyDomain.length === 0 ? (
              <div className="text-center py-8 text-site-muted text-sm italic">
                {t('noPendingExchanges')}
              </div>
            ) : (
              sharesInMyDomain.map(share => (
                <div key={share.id} className="flex items-center justify-between p-3 rounded-lg bg-site-bg/50 border border-site-border/50 group hover:border-warm-primary/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-warm-primary/10 flex items-center justify-center text-warm-primary font-bold text-xs">
                      {share.ownerDomain.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-site-text">{share.ownerDomain.name}</div>
                      <div className="text-[10px] text-site-muted uppercase tracking-wider">{t('shareholder')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-bold text-warm-primary">{share.percentage}%</div>
                      <div className="w-24 h-1.5 bg-site-bg rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full bg-warm-primary transition-all duration-1000" 
                          style={{ width: `${share.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Propose Exchange */}
      <div className="card overflow-hidden bg-site-card/50 backdrop-blur-sm border-warm-primary/10">
        <div className="bg-warm-primary/5 px-6 py-4 border-b border-warm-primary/10">
          <h3 className="text-lg font-bold text-site-text flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-warm-primary" />
            {t('proposeExchange')}
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          <div className="md:col-span-1 space-y-2">
            <label className="text-xs font-bold text-site-muted uppercase tracking-wider">{t('targetDomain')}</label>
            <select
              value={selectedTargetDomainId}
              onChange={(e) => setSelectedTargetDomainId(e.target.value)}
              className="w-full bg-site-bg border border-site-border rounded-lg px-4 py-2 text-site-text focus:ring-2 focus:ring-warm-primary outline-none"
            >
              <option value="">{t('selectTargetDomain')}</option>
              {allDomains.filter(d => d.id !== selectedMyDomainId).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          
          <div className="md:col-span-1 space-y-2">
            <label className="text-xs font-bold text-site-muted uppercase tracking-wider flex items-center gap-1">
              <Percent size={12} /> {t('percentageToTarget')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={givePercent}
              onChange={(e) => setGivePercent(Number(e.target.value))}
              className="w-full bg-site-bg border border-site-border rounded-lg px-4 py-2 text-site-text focus:ring-2 focus:ring-warm-primary outline-none"
            />
          </div>

          <div className="md:col-span-1 space-y-2">
            <label className="text-xs font-bold text-site-muted uppercase tracking-wider flex items-center gap-1">
              <Percent size={12} /> {t('percentageFromTarget')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={receivePercent}
              onChange={(e) => setReceivePercent(Number(e.target.value))}
              className="w-full bg-site-bg border border-site-border rounded-lg px-4 py-2 text-site-text focus:ring-2 focus:ring-warm-primary outline-none"
            />
          </div>

          <div className="md:col-span-1">
            <button
              onClick={handlePropose}
              disabled={submitting || !selectedTargetDomainId}
              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 shadow-lg shadow-warm-primary/20"
            >
              {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('proposeExchange')}
            </button>
          </div>
        </div>
      </div>

      {/* Pending Proposals */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-site-text flex items-center gap-2 px-2">
          <Vote size={24} className="text-warm-primary" />
          {t('pendingExchanges')}
        </h3>
        
        {pendingProposals.length === 0 ? (
          <div className="card p-12 text-center text-site-muted bg-site-card/30 border-dashed border-site-border">
            <Vote size={48} className="mx-auto mb-4 opacity-20" />
            <p>{t('noPendingExchanges')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingProposals.map((proposal) => {
              const myVote = proposal.votes.find(v => v.voterId === session?.user?.id);
              
              return (
                <div key={proposal.id} className="card bg-site-card/50 border-warm-primary/10 overflow-hidden group hover:border-warm-primary/30 transition-all">
                  <div className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex-1 flex items-center justify-center md:justify-start gap-4">
                        <div className="text-center">
                          <div className="text-sm font-bold text-site-text">{proposal.proposerDomain.name}</div>
                          <div className="text-xs text-red-400 mt-1 font-bold">-{proposal.percentageProposerToTarget}%</div>
                        </div>
                        
                        <div className="flex flex-col items-center gap-1">
                          <div className="h-px w-16 bg-site-border relative">
                            <ArrowRightLeft size={14} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-site-muted" />
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-sm font-bold text-site-text">{proposal.targetDomain.name}</div>
                          <div className="text-xs text-green-400 mt-1 font-bold">+{proposal.percentageProposerToTarget}%</div>
                        </div>
                      </div>

                      <div className="hidden md:block w-px h-12 bg-site-border/50" />

                      <div className="flex-1 flex items-center justify-center md:justify-start gap-4">
                        <div className="text-center">
                          <div className="text-sm font-bold text-site-text">{proposal.targetDomain.name}</div>
                          <div className="text-xs text-red-400 mt-1 font-bold">-{proposal.percentageTargetToProposer}%</div>
                        </div>
                        
                        <div className="flex flex-col items-center gap-1">
                          <div className="h-px w-16 bg-site-border relative">
                            <ArrowRightLeft size={14} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-site-muted" />
                          </div>
                        </div>

                        <div className="text-center">
                          <div className="text-sm font-bold text-site-text">{proposal.proposerDomain.name}</div>
                          <div className="text-xs text-green-400 mt-1 font-bold">+{proposal.percentageTargetToProposer}%</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {myVote ? (
                          <div className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${
                            myVote.vote === 'APPROVE' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}>
                            {myVote.vote === 'APPROVE' ? <Check size={16} /> : <X size={16} />}
                            {t(`vote${myVote.vote === 'APPROVE' ? 'Approve' : 'Reject'}`)}
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleVote(proposal.id, 'APPROVE')}
                              disabled={!!votingId}
                              className="btn-primary bg-green-600 hover:bg-green-700 border-none px-4 py-2 flex items-center gap-2"
                            >
                              <Check size={16} />
                              {t('voteApprove')}
                            </button>
                            <button
                              onClick={() => handleVote(proposal.id, 'REJECT')}
                              disabled={!!votingId}
                              className="btn-secondary border-red-500/30 hover:bg-red-500/10 text-red-500 px-4 py-2 flex items-center gap-2"
                            >
                              <X size={16} />
                              {t('voteReject')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress bar for the proposal consensus */}
                  {proposal.stats && (
                    <div className="bg-site-bg/50 px-6 py-2 border-t border-site-border/30 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-site-muted">
                      <div className="flex items-center gap-4">
                        <span className={proposal.stats.proposerVotes / proposal.stats.proposerExperts >= 0.5 ? 'text-green-500' : ''}>
                          {proposal.proposerDomain.name}: {proposal.stats.proposerVotes}/{proposal.stats.proposerExperts}
                        </span>
                        <span className={proposal.stats.targetVotes / proposal.stats.targetExperts >= 0.5 ? 'text-green-500' : ''}>
                          {proposal.targetDomain.name}: {proposal.stats.targetVotes}/{proposal.stats.targetExperts}
                        </span>
                      </div>
                      <div>{t('consensusRequired')}</div>
                    </div>
                  )}
                  <div className="h-1.5 w-full bg-site-bg flex">
                    {proposal.stats && (
                      <>
                        <div 
                          className="h-full bg-green-500/50 transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (proposal.stats.proposerVotes / proposal.stats.proposerExperts) * 50)}%` }} 
                        />
                        <div className="w-0.5 h-full bg-site-bg" />
                        <div 
                          className="h-full bg-green-500/50 transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (proposal.stats.targetVotes / proposal.stats.targetExperts) * 50)}%` }} 
                        />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
