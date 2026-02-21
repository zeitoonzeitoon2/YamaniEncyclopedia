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
}

const TeamPortfolioCard = ({ teamName, wing, items }: TeamPortfolioCardProps) => {
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
      <div className="p-4 border-b border-site-border bg-site-secondary/20 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg text-site-text">{teamName}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${wing === 'RIGHT' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
            {wing === 'RIGHT' ? tWings('right') : tWings('left')}
          </span>
        </div>
        {/* Placeholder for actions */}
        <button className="text-site-muted hover:text-site-text">
          <MoreHorizontal size={20} />
        </button>
      </div>
      
      <div className="p-6 flex-1 flex items-end gap-4 overflow-x-auto min-h-[300px]">
        {holdings.length === 0 ? (
          <div className="w-full text-center text-site-muted py-10">
            {t('noHoldings')}
          </div>
        ) : (
          holdings.map((item) => {
            const color = stringToColor(item.target.id)
            // Height based on percentage (max 100%)
            // Let's cap at 100
            const height = Math.min(item.stats.effective, 100)
            
            return (
              <div key={item.target.id} className="flex flex-col items-center gap-2 min-w-[60px] group relative">
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-site-bg border border-site-border p-2 rounded shadow-lg text-xs z-10 w-48 pointer-events-none">
                  <div className="font-bold mb-1">{item.target.name}</div>
                  <div className="flex justify-between">
                    <span>{t('holdingsTable.permanent')}:</span>
                    <span>{item.stats.permanent.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between font-bold text-warm-primary">
                    <span>{t('holdingsTable.effective')}:</span>
                    <span>{item.stats.effective.toFixed(1)}%</span>
                  </div>
                  {item.stats.lent > 0 && (
                     <div className="flex justify-between text-red-400">
                       <span>{t('holdingsTable.lent')}:</span>
                       <span>{item.stats.lent.toFixed(1)}%</span>
                     </div>
                  )}
                  {item.stats.borrowed > 0 && (
                     <div className="flex justify-between text-green-400">
                       <span>{t('holdingsTable.borrowed')}:</span>
                       <span>{item.stats.borrowed.toFixed(1)}%</span>
                     </div>
                  )}
                </div>

                {/* Percentage Label */}
                <span className="text-xs font-bold text-site-text mb-1">
                  {item.stats.effective.toFixed(0)}%
                </span>
                
                {/* Bar */}
                <div 
                  className="w-12 rounded-t-lg transition-all hover:brightness-110 relative"
                  style={{ 
                    height: `${Math.max(height * 2, 4)}px`, // Scale up a bit for visibility, min 4px
                    backgroundColor: color 
                  }}
                >
                  {/* Pattern/Overlay for borrowed/lent? */}
                  {item.stats.borrowed > 0 && (
                    <div className="absolute inset-0 bg-green-500/20 animate-pulse" />
                  )}
                </div>
                
                {/* Domain Name */}
                <span className="text-xs text-site-muted truncate w-16 text-center" title={item.target.name}>
                  {item.target.name}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TeamPortfolioCard
