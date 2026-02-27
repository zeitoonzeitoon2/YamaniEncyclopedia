'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type VotingStatusSummaryProps = {
  eligibleCount: number
  totalRights: number
  votedCount: number
  rightsUsedPercent: number
  totalScore?: number
  labels?: {
    eligible?: string
    totalRights?: string
    voted?: string
    rightsUsed?: string
  }
}

export default function VotingStatusSummary({
  eligibleCount,
  totalRights,
  votedCount,
  totalScore,
}: VotingStatusSummaryProps) {
  const t = useTranslations('votingThresholds')
  const [hoveredItem, setHoveredItem] = useState<'participation' | 'score' | null>(null)

  const participationThreshold = totalRights / 2
  const scoreThreshold = totalRights / 2
  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)

  const participationMet = votedCount >= participationThreshold
  const scoreMet = totalScore !== undefined && totalScore >= scoreThreshold

  return (
    <div className="space-y-1.5">
      {/* Participation Threshold */}
      <div
        className="relative group"
        onMouseEnter={() => setHoveredItem('participation')}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-default transition-colors ${
          participationMet
            ? 'border-green-600/30 bg-green-600/5'
            : 'border-site-border bg-site-secondary/20'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${participationMet ? 'bg-green-500' : 'bg-site-muted/40'}`} />
          <span className="text-site-muted">{t('participationLabel')}</span>
          <span className={`font-semibold mr-auto ${participationMet ? 'text-green-500' : 'text-site-text'}`}>
            {votedCount}
          </span>
          <span className="text-site-muted/60">{t('of')}</span>
          <span className="text-site-muted font-medium">{fmt(participationThreshold)}</span>
          {participationMet && <span className="text-green-500 text-[10px]">✓</span>}
        </div>

        {hoveredItem === 'participation' && (
          <div className="absolute z-50 bottom-full mb-2 right-0 left-0 p-3 rounded-lg border border-site-border bg-site-bg shadow-xl text-[11px] leading-relaxed text-site-muted" dir="rtl">
            {t('participationTooltip', {
              eligible: eligibleCount,
              totalRights: fmt(totalRights),
              threshold: fmt(participationThreshold),
              current: votedCount,
            })}
          </div>
        )}
      </div>

      {/* Score Threshold */}
      {totalScore !== undefined && (
        <div
          className="relative group"
          onMouseEnter={() => setHoveredItem('score')}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-default transition-colors ${
            scoreMet
              ? 'border-green-600/30 bg-green-600/5'
              : 'border-site-border bg-site-secondary/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${scoreMet ? 'bg-green-500' : 'bg-site-muted/40'}`} />
            <span className="text-site-muted">{t('scoreLabel')}</span>
            <span className={`font-semibold mr-auto ${
              totalScore > 0 ? 'text-green-500' : totalScore < 0 ? 'text-red-500' : 'text-site-text'
            }`}>
              {totalScore > 0 ? `+${totalScore}` : totalScore}
            </span>
            <span className="text-site-muted/60">{t('of')}</span>
            <span className="text-site-muted font-medium">{fmt(scoreThreshold)}</span>
            {scoreMet && <span className="text-green-500 text-[10px]">✓</span>}
          </div>

          {hoveredItem === 'score' && (
            <div className="absolute z-50 bottom-full mb-2 right-0 left-0 p-3 rounded-lg border border-site-border bg-site-bg shadow-xl text-[11px] leading-relaxed text-site-muted" dir="rtl">
              {t('scoreTooltip', {
                eligible: eligibleCount,
                totalRights: fmt(totalRights),
                threshold: fmt(scoreThreshold),
                current: totalScore,
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
