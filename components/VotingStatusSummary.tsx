'use client'

type VotingStatusSummaryProps = {
  eligibleCount: number
  totalRights: number
  votedCount: number
  rightsUsedPercent: number
  labels: {
    eligible: string
    totalRights: string
    voted: string
    rightsUsed: string
  }
}

const formatRights = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export default function VotingStatusSummary({ eligibleCount, totalRights, votedCount, rightsUsedPercent, labels }: VotingStatusSummaryProps) {
  const usedPercent = Math.max(0, Math.min(100, Math.round(rightsUsedPercent)))
  return (
    <div className="rounded-lg border border-site-border bg-site-secondary/20 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-site-muted">
        <span className="px-2 py-0.5 rounded-full border border-site-border bg-site-bg">
          {labels.eligible}: {eligibleCount}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-site-border bg-site-bg">
          {labels.totalRights}: {formatRights(totalRights)}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-site-border bg-site-bg">
          {labels.voted}: {votedCount}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-site-border bg-site-bg">
          {labels.rightsUsed}: {usedPercent}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-site-border/40 overflow-hidden">
        <div className="h-full bg-warm-primary" style={{ width: `${usedPercent}%` }} />
      </div>
    </div>
  )
}
