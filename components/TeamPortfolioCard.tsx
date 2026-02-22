import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, ArrowLeft, MoreHorizontal, CheckCircle } from 'lucide-react'

// 20 Distinct Colors Palette (Kelly's Max Contrast + Distinct additions)
// Hand-picked to ensure maximum differentiation between adjacent items
export const COLOR_PALETTE = [
  '#FFB300', // Vivid Yellow
  '#803E75', // Strong Purple
  '#FF6800', // Vivid Orange
  '#A6BDD7', // Very Light Blue
  '#C10020', // Vivid Red
  '#CEA262', // Grayish Yellow
  '#817066', // Medium Gray
  '#007D34', // Vivid Green
  '#F6768E', // Strong Purplish Pink
  '#00538A', // Strong Blue
  '#FF7A5C', // Strong Yellowish Pink
  '#53377A', // Strong Violet
  '#FF8E00', // Vivid Orange Yellow
  '#B32851', // Strong Purplish Red
  '#F4C800', // Vivid Greenish Yellow
  '#7F180D', // Strong Reddish Brown
  '#93AA00', // Vivid Yellowish Green
  '#593315', // Deep Yellowish Brown
  '#F13A13', // Vivid Reddish Orange
  '#232C16', // Dark Olive Green
]

// Helper to determine text color based on background luminance
export const getContrastColor = (hexColor: string) => {
  const r = parseInt(hexColor.substring(1, 3), 16)
  const g = parseInt(hexColor.substring(3, 5), 16)
  const b = parseInt(hexColor.substring(5, 7), 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return (yiq >= 128) ? '#000000' : '#ffffff'
}

// Helper to generate consistent color using FNV-1a hash for better distribution
// Deprecated for domains: Use index-based lookup instead where possible
export const stringToColor = (str: string) => {
  let hash = 2166136261 // FNV_OFFSET_BASIS_32
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619) // FNV_PRIME_32
  }
  const index = (hash >>> 0) % COLOR_PALETTE.length
  return COLOR_PALETTE[index]
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
  contractIndexMap?: Record<string, number>
  embedded?: boolean
  getDomainColor?: (id: string) => string
  onlyShowTargetId?: string
  hideWingLabel?: boolean
}

const TeamPortfolioCard = ({ teamName, wing, items, highlightedDomainId, contractIndexMap, embedded = false, getDomainColor, onlyShowTargetId, hideWingLabel = false }: TeamPortfolioCardProps) => {
  const t = useTranslations('admin.dashboard.portfolio')
  const tWings = useTranslations('admin.dashboard.wings')
  const [tooltip, setTooltip] = useState<{ item: PortfolioItem, rect: DOMRect } | null>(null)

  // Filter items that have significant holdings (> 0.1%)
  const holdings = items.filter(item => {
    const isSignificant = item.stats.permanent > 0.1 || item.stats.effective > 0.1
    if (onlyShowTargetId) {
      return isSignificant && item.target.id === onlyShowTargetId
    }
    return isSignificant
  })

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
    <div className={`card ${embedded ? 'border-0 bg-transparent shadow-none h-full' : 'bg-site-secondary/10 border border-site-border'} overflow-hidden flex flex-col relative`}>
      {(!embedded || !hideWingLabel) && (
        <div className={`p-3 border-b border-site-border ${embedded ? 'bg-transparent text-center' : 'bg-site-secondary/20 flex justify-between items-center'}`}>
          {!embedded && (
            <div>
              <h3 className="font-bold text-base text-site-text truncate max-w-[150px]" title={teamName}>{teamName}</h3>
            </div>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${wing === 'RIGHT' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'} ${embedded ? 'mx-auto block w-fit' : ''}`}>
            {wing === 'RIGHT' ? tWings('right') : tWings('left')}
          </span>
          {!embedded && (
            <button className="text-site-muted hover:text-site-text">
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>
      )}
      
      <div className={`p-3 flex-1 flex items-end gap-1.5 overflow-x-auto min-h-[160px] pb-6 ${(!embedded || !hideWingLabel) ? '' : 'pt-2'}`}>
        {holdings.length === 0 ? (
          <div className="w-full text-center text-site-muted text-xs py-10">
            {t('noHoldings')}
          </div>
        ) : (
          holdings.map((item) => {
            const baseColor = getDomainColor ? getDomainColor(item.target.id) : stringToColor(item.target.id)
            // Darker shade for LEFT wing to distinguish visual duplicates
            const color = item.target.wing === 'LEFT' 
              ? baseColor // Use exact color for consistency, or modify if needed
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
            // If onlyShowTargetId is set, we don't dim anything because everything visible is the target
            const isHighlighted = !highlightedDomainId || item.target.id === highlightedDomainId
            const barOpacity = onlyShowTargetId ? 1 : (isHighlighted ? 1 : 0.2)
            const barFilter = onlyShowTargetId ? 'none' : (isHighlighted ? 'none' : 'grayscale(100%)')

            return (
              <div 
                key={`${item.target.id}-${item.target.wing}`} 
                className="flex flex-col items-center gap-1 min-w-[50px] group relative cursor-pointer" 
                style={{ opacity: barOpacity, filter: barFilter }}
                onMouseEnter={(e) => setTooltip({ item, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => {
                  const element = document.getElementById(`domain-card-${item.target.id}`)
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                }}
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
                     <div className="font-bold mb-1 text-site-text flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                          {t('temporaryShare')}
                        </div>
                        {contractIndexMap && contractIndexMap[contract.id] && (
                          <span className="text-site-muted font-mono bg-site-bg px-1 rounded border border-site-border/30 text-[9px]">
                            #{contractIndexMap[contract.id]}
                          </span>
                        )}
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
