'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { PieChart, Users, Percent, CheckCircle } from 'lucide-react'

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
}

export default function DomainElectionStatus({ domainId, wing }: { domainId: string, wing: string }) {
  const t = useTranslations('admin.voting') // Assuming translations exist or fallback
  const tAdmin = useTranslations('admin')
  const [status, setStatus] = useState<ElectionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!domainId || !wing) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/domains/election-status?domainId=${domainId}&wing=${wing}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'ACTIVE') {
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
    <div className="mt-4 p-4 rounded-xl border border-site-border bg-site-secondary/20">
      <h3 className="text-sm font-bold text-site-text mb-3 flex items-center gap-2">
        <PieChart size={16} className="text-warm-primary" />
        {t('electionStatusTitle') || 'وضعیت انتخابات'}
      </h3>
      
      <div className="space-y-4">
        {status.shares.map((share) => {
          const turnoutPercent = share.totalExperts > 0 
            ? Math.round((share.votedExperts / share.totalExperts) * 100) 
            : 0
          
          return (
            <div key={`${share.ownerDomainId}-${share.ownerWing}`} className="bg-site-bg/50 p-3 rounded-lg border border-site-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-site-text">
                    {share.ownerDomainName} ({tAdmin(share.ownerWing === 'RIGHT' ? 'rightWing' : 'leftWing')})
                  </span>
                  <span className="text-[10px] text-site-muted">
                    {t('votingPower') || 'قدرت رای'}: <span className="text-warm-primary">{share.percentage}%</span>
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-site-text flex items-center justify-end gap-1">
                    <Users size={12} className="text-site-muted" />
                    {share.votedExperts} / {share.totalExperts}
                  </div>
                  <div className="text-[10px] text-site-muted">
                    {turnoutPercent}% {t('voted') || 'مشارکت'}
                  </div>
                </div>
              </div>
              
              {/* Progress Bar for Turnout */}
              <div className="h-1.5 w-full bg-site-border/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-warm-primary transition-all duration-500"
                  style={{ width: `${turnoutPercent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
