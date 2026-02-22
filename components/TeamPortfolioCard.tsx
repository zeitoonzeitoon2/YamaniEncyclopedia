import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, ArrowLeft, MoreHorizontal, CheckCircle } from 'lucide-react'

// Helper to generate consistent color
export const stringToColor = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = Math.imul(hash, 2654435761) // Knuth's multiplicative hash to mix bits
  }
  const h = Math.abs(hash % 360)
  return `hsl(${h}, 65%, 45%)`
}

export type Contract = {
  id: string
  type: 'INBOUND' | 'OUTBOUND'
  percentageInvested: number
  percentageReturn: number
  endDate?: string | null
}

export type PortfolioItem = {
  team: { id: string; name: string; wing: string }
  target: { id: string; name: string; wing: string }
  stats: {
    permanent: number
    effective: number
    temporary?: number // Added this field
    myPower: number
    lent: number
    borrowed: number
    claims: number
    obligations: number
  }
  contracts: Contract[]
  votingRights?: string[]
}

type TeamPortfolioCardProps = {
  teamName: string
  wing: string
  items: PortfolioItem[]
  highlightedDomainId?: string
}

// Helper to generate a stable short numeric ID from a string
const getShortNumericId = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString().substring(0, 6)
}

const TeamPortfolioCard = ({ teamName, wing, items, highlightedDomainId }: TeamPortfolioCardProps) => {
  const t = useTranslations('admin.dashboard.portfolio')
  const tWings = useTranslations('admin.dashboard.wings')
  const [tooltip, setTooltip] = useState<{ item: PortfolioItem, rect: DOMRect } | null>(null)

  // Filter items that have significant holdings (> 0.1%)
  const holdings = items.filter(item => item.stats.permanent > 0.1 || item.stats.effective > 0.1)

  // Sort by effective power desc
  holdings.sort((a, b) => b.stats.effective - a.stats.effective)

  // Max percentage for scaling bars if needed, or stick to 100% height
  // User said "50% full, 20% full", implying absolute scale.
  // But usually voting power sums to 100% across ALL shareholders.
  // A single team might own only 5% of a domain.
  // So the bars might be very small if we use 100% scale.
  // However, "percentage of voting power held by this team in target domain".
  // If I own 51%, it's huge. If 1%, small.
  // Let's use 100% scale for now, but maybe allow zooming or log scale if needed.
  // Or just show value clearly.

  return (
    <div className="card bg-site-secondary/10 border border-site-border overflow-hidden flex flex-col h-full relative">
      <div className="p-3 border-b border-site-border bg-site-secondary/20 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-base text-site-text truncate max-w-[150px]" title={teamName}>{teamName}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${wing === 'RIGHT' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
            {wing === 'RIGHT' ? tWings('right') : tWings('left')}
          </span>
        </div>
        {/* Placeholder for actions */}
        <button className="text-site-muted hover:text-site-text">
          <MoreHorizontal size={16} />
        </button>
      </div>
      
      <div className="p-3 flex-1 flex items-end gap-1.5 overflow-x-auto min-h-[160px] pb-6">
        {holdings.length === 0 ? (
          <div className="w-full text-center text-site-muted text-xs py-10">
            {t('noHoldings')}
          </div>
        ) : (
          holdings.map((item) => {
            const baseColor = stringToColor(item.target.id)
            // Darker shade for LEFT wing to distinguish visual duplicates
            const color = item.target.wing === 'LEFT' 
              ? baseColor.replace('45%', '35%') 
              : baseColor

            // Calculate heights for Permanent and Temporary bars
            // We use item.stats.permanent (DB value) OR calculate from effective?
            // route.ts now sends item.stats.permanent (from breakdown) and item.stats.temporary (from breakdown)
            // Let's rely on those.
            
            const permVal = item.stats.permanent || 0
            const tempVal = item.stats.temporary || 0
            
            // Heights capped at 100
            const permHeight = Math.min(permVal, 100)
            const tempHeight = Math.min(tempVal, 100)
            
            // Highlight logic
            const isHighlighted = !highlightedDomainId || item.target.id === highlightedDomainId
            const barOpacity = isHighlighted ? 1 : 0.2
            const barFilter = isHighlighted ? 'none' : 'grayscale(100%)'

            return (
              <div 
                key={`${item.target.id}-${item.target.wing}`} 
                className="flex flex-col items-center gap-1 min-w-[50px] group relative cursor-help" 
                style={{ opacity: barOpacity, filter: barFilter }}
                onMouseEnter={(e) => setTooltip({ item, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Percentage Label */}
                <div className="flex items-end justify-center w-14 gap-[1px] mb-1">
                  {permVal > 0 && (
                    <span className={`font-bold text-center ${tempVal > 0 ? 'w-1/2 text-[10px]' : 'w-full text-xs'} text-site-text`}>
                      {permVal.toFixed(0)}%
                    </span>
                  )}
                  {tempVal > 0 && (
                    <span className={`font-bold text-center ${permVal > 0 ? 'w-1/2 text-[10px]' : 'w-full text-xs'} text-site-muted`}>
                      {tempVal.toFixed(0)}%
                    </span>
                  )}
                </div>
                
                {/* Bar Container */}
                <div className="flex items-end justify-center gap-[1px] w-14">
                  {/* Permanent Bar */}
                  {permVal > 0 && (
                    <div 
                      className={`rounded-t-lg transition-all hover:brightness-110 relative ${tempVal > 0 ? 'w-1/2' : 'w-full'}`}
                      style={{ 
                        height: `${Math.max(permHeight * 2, 4)}px`, 
                        backgroundColor: color 
                      }}
                    />
                  )}
                  
                  {/* Temporary Bar */}
                  {tempVal > 0 && (
                    <div 
                      className={`rounded-t-lg transition-all hover:brightness-110 relative ${permVal > 0 ? 'w-1/2' : 'w-full'}`}
                      style={{ 
                        height: `${Math.max(tempHeight * 2, 4)}px`, 
                        backgroundColor: color,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)'
                      }}
                    />
                  )}
                </div>
                
                {/* Domain Name */}
                <div className="flex flex-col items-center w-16">
                  <span className="text-xs text-site-muted truncate w-full text-center" title={item.target.name}>
                    {item.target.name}
                  </span>
                  <span className={`text-[9px] ${item.target.wing === 'RIGHT' ? 'text-blue-500/70' : 'text-red-500/70'}`}>
                    {item.target.wing === 'RIGHT' ? tWings('right') : tWings('left')}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {tooltip && (
        <div 
          className="fixed z-[9999] bg-site-bg border border-site-border p-3 rounded-lg shadow-xl text-xs w-52 pointer-events-none"
          style={{ 
            left: tooltip.rect.left + tooltip.rect.width / 2, 
            top: tooltip.rect.top - 10,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="font-bold mb-2 text-site-text border-b border-site-border pb-1 flex justify-between items-center">
            <span className="truncate max-w-[120px]">{tooltip.item.target.name}</span>
            <span className={`text-[10px] ${tooltip.item.target.wing === 'RIGHT' ? 'text-blue-500' : 'text-red-500'}`}>
              ({tooltip.item.target.wing === 'RIGHT' ? tWings('right') : tWings('left')})
            </span>
          </div>
          <div className="space-y-1.5">
            {/* Voting Power Indicator */}
            <div className="border-site-border pt-1">
               {tooltip.item.votingRights && tooltip.item.votingRights.length > 0 ? (
                 tooltip.item.votingRights.map((vWing, idx) => (
                   <div key={idx} className="flex items-start gap-1 text-green-600 dark:text-green-400">
                     <CheckCircle size={14} className="mt-0.5 shrink-0" />
                     <span className="leading-tight">
                       {t('grantsVotingPower', { 
                         wing: vWing === 'RIGHT' ? tWings('right') : tWings('left'),
                         name: tooltip.item.target.name 
                       })}
                     </span>
                   </div>
                 ))
               ) : (
                 <div className="text-site-muted text-[10px]">{t('noVotingPower')}</div>
               )}
            </div>

            {/* Temporary Share Contracts Details */}
            {tooltip.item.contracts && tooltip.item.contracts.length > 0 && tooltip.item.contracts.some(c => c.type === 'INBOUND') && (
              <div className="mt-2 space-y-2 border-t border-site-border pt-2">
                {tooltip.item.contracts.filter(c => c.type === 'INBOUND').map((contract) => (
                  <div key={contract.id} className="bg-site-secondary/10 p-2 rounded text-[10px] border border-site-border/50">
                     <div className="font-bold mb-1 text-site-text flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                        {t('temporaryShare')}
                     </div>
                     <div className="flex justify-between items-center mb-1">
                       <span className="text-site-muted">{t('contractId')}:</span>
                       <span className="font-mono bg-site-bg px-1 rounded border border-site-border/50 text-[9px]">
                         {getShortNumericId(contract.id)}
                       </span>
                     </div>
                     <div className="flex flex-col mt-1 bg-red-500/5 p-1.5 rounded border border-red-500/10">
                        <span className="text-site-muted mb-0.5">{t('obligation')}:</span>
                        <span className="text-red-500 font-medium">
                          {contract.percentageReturn}% {t('profitShare')}
                        </span>
                     </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamPortfolioCard
