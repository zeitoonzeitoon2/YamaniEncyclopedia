'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { PieChart, Users, Percent, Vote, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'

type ElectionShare = {
  ownerDomainId: string
  ownerDomainName: string
  ownerWing: string
  percentage: number
  totalExperts: number
  votedExperts: number
}

type ElectionStatus = {
  status: string
  roundId: string
  shares: ElectionShare[]
  profitPercentage?: number
  domainExpertsCount?: number
}

export default function DomainElectionStatus({ domainId, wing }: { domainId: string, wing: string }) {
  const t = useTranslations('admin.voting')
  const tAdmin = useTranslations('admin')
  const [status, setStatus] = useState<ElectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!domainId || !wing) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/domains/election-status?domainId=${domainId}&wing=${wing}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'ACTIVE' || data.status === 'MEMBERS_ACTIVE' || data.status === 'HEAD_ACTIVE' || data.status === 'IDLE') {
          setStatus(data)
        } else {
          setStatus(null)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [domainId, wing])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) return <div className="text-xs text-site-muted animate-pulse">...</div>
  if (!status || !status.shares || status.shares.length === 0) return null

  return (
    <div className="mt-6 p-5 rounded-2xl border border-site-border bg-gradient-to-br from-site-secondary/10 to-site-bg shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1">
      <h3 
        className="text-base font-bold text-site-text flex items-center gap-2 border-b border-site-border/50 pb-2 cursor-pointer transition-all duration-200 hover:opacity-80 hover:translate-x-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Vote className="text-warm-primary" size={20} />
        {t('electionStatusTitle')}
        <span className="mr-auto flex items-center gap-2">
          <span className="text-xs font-normal text-site-muted bg-site-secondary/30 px-2 py-0.5 rounded-full">
            {wing === 'LEFT' ? tAdmin('leftWing') : tAdmin('rightWing')}
          </span>
          {isExpanded ? <ChevronUp size={16} className="text-site-muted" /> : <ChevronDown size={16} className="text-site-muted" />}
        </span>
      </h3>
      
      {isExpanded && (
        <div className="space-y-3 mt-4 animate-in slide-in-from-top-2 fade-in duration-200">
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-site-bg p-3 rounded-xl border border-site-border/60 flex flex-col items-center justify-center">
              <div className="text-xs text-site-muted mb-1">{tAdmin('expertsCount') || 'تعداد کارشناسان'}</div>
              <div className="text-lg font-bold text-site-text flex items-center gap-1">
                <Users size={16} className="text-site-muted" />
                {status.domainExpertsCount || 0}
              </div>
            </div>
            
            <div className="bg-site-bg p-3 rounded-xl border border-site-border/60 flex flex-col items-center justify-center">
              <div className="text-xs text-site-muted mb-1">سود/زیان</div>
              <div className={`text-lg font-bold flex items-center gap-1 ${
                (status.profitPercentage || 0) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                <TrendingUp size={16} className={(status.profitPercentage || 0) >= 0 ? 'text-green-500' : 'text-red-500'} />
                {status.profitPercentage || 0}%
              </div>
            </div>
          </div>

          {status.shares.map((share) => {
            const turnoutPercent = share.totalExperts > 0 
              ? Math.round((share.votedExperts / share.totalExperts) * 100) 
              : 0
            
            return (
              <div key={`${share.ownerDomainId}-${share.ownerWing}`} className="bg-site-bg p-3 rounded-xl border border-site-border/60 transition-all duration-200 hover:border-warm-primary/50 hover:shadow-sm hover:-translate-y-0.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-site-text flex items-center gap-1">
                      {share.ownerDomainName}
                      <span className="text-[10px] text-site-muted bg-site-border/20 px-1.5 py-0.5 rounded">
                        {tAdmin(share.ownerWing === 'RIGHT' ? 'rightWing' : 'leftWing')}
                      </span>
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-site-muted flex items-center gap-1">
                        <Percent size={12} className="text-warm-primary" />
                        {t('votingPower')}: <span className="text-site-text font-medium">{share.percentage}%</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-site-secondary/10 px-3 py-1.5 rounded-lg border border-site-border/30">
                    <div className="text-center">
                      <div className="text-xs text-site-muted mb-0.5">{t('voted')}</div>
                      <div className="text-sm font-bold text-warm-primary">{turnoutPercent}%</div>
                    </div>
                    <div className="h-6 w-px bg-site-border/30"></div>
                    <div className="text-center">
                      <div className="text-xs text-site-muted mb-0.5">{tAdmin('roleExpert')}</div>
                      <div className="text-sm font-bold text-site-text">
                        {share.votedExperts} <span className="text-site-muted font-normal text-[10px]">/ {share.totalExperts}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-site-secondary/20 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-warm-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${turnoutPercent}%` }}
                  ></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
