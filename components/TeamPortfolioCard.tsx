import React from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, ArrowLeft, MoreHorizontal } from 'lucide-react'

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

type PortfolioItem = {
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
  contracts: any[]
}

type TeamPortfolioCardProps = {
  teamName: string
  wing: string
  items: PortfolioItem[]
  highlightedDomainId?: string
}

const TeamPortfolioCard = ({ teamName, wing, items, highlightedDomainId }: TeamPortfolioCardProps) => {
  const t = useTranslations('admin.dashboard.portfolio')
  const tWings = useTranslations('admin.dashboard.wings')

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
    <div className="card bg-site-secondary/10 border border-site-border overflow-hidden flex flex-col h-full">
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
      
      <div className="p-3 flex-1 flex items-end gap-1.5 overflow-x-auto min-h-[160px]">
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
              <div key={`${item.target.id}-${item.target.wing}`} className="flex flex-col items-center gap-1 min-w-[50px] group relative" style={{ opacity: barOpacity, filter: barFilter }}>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-site-bg border border-site-border p-2 rounded shadow-lg text-xs z-10 w-48 pointer-events-none">
                  <div className="font-bold mb-1">
                    {item.target.name}
                    <span className="text-[10px] ml-1 opacity-75">
                      ({item.target.wing === 'RIGHT' ? tWings('right') : tWings('left')})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('holdingsTable.permanent')}:</span>
                    <span>{permVal.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between font-bold text-warm-primary">
                    <span>{t('holdingsTable.effective')}:</span>
                    <span>{item.stats.effective.toFixed(1)}%</span>
                  </div>
                  {tempVal > 0 && (
                     <div className="flex justify-between text-yellow-400">
                       <span>{t('holdingsTable.lent')}:</span> {/* Using "lent" label for Temporary as per user intent? Or maybe "Temporary"? User said "Temporary ownership" */}
                       <span>{tempVal.toFixed(1)}%</span>
                     </div>
                  )}
                </div>

                {/* Percentage Label */}
                <span className="text-xs font-bold text-site-text mb-1">
                  {item.stats.effective.toFixed(0)}%
                </span>
                
                {/* Bar Container */}
                <div className="flex items-end justify-center gap-[1px] w-12">
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
    </div>
  )
}

export default TeamPortfolioCard
