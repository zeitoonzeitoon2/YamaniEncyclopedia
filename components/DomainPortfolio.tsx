'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { PieChart, TrendingUp, Users, Award, ChevronDown, ChevronRight, Activity, FileText, LayoutGrid, Network, BarChart3, Info } from 'lucide-react'
import TeamPortfolioCard, { stringToColor } from './TeamPortfolioCard'

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
  contracts: {
    id: string
    type: 'OUTBOUND' | 'INBOUND'
    percentageInvested: number
    percentageReturn: number
    endDate: string | null
  }[]
}

type MyTeam = {
  id: string
  name: string
  wing: string
  role: string
}

const flattenTree = (nodes: any[]): {id: string, name: string}[] => {
  let result: {id: string, name: string}[] = []
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name })
    if (node.children && node.children.length > 0) {
      // @ts-ignore
      result = [...result, ...flattenTree(node.children)]
    }
  }
  return result
}

export default function DomainPortfolio() {
  const t = useTranslations('admin.dashboard.portfolio')
  const tWings = useTranslations('admin.dashboard.wings')
  const { data: session } = useSession()

  const [myTeams, setMyTeams] = useState<MyTeam[]>([])
  const [allDomains, setAllDomains] = useState<{id: string, name: string}[]>([])
  const [selectedTeamKey, setSelectedTeamKey] = useState<string>('')
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards')
  const [showLegend, setShowLegend] = useState(false)
  const [highlightedAssetId, setHighlightedAssetId] = useState<string>('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch all domains for the dropdown
      const domainsRes = await fetch('/api/admin/domains')
      const domainsData = await domainsRes.json()
      if (domainsRes.ok) {
        const domains = domainsData.roots ? flattenTree(domainsData.roots) : (domainsData.domains || [])
        setAllDomains(domains)
      }

      // Fetch portfolio
      let url = '/api/admin/domains/portfolio'
      if (selectedTeamKey) {
        const [dId, dWing] = selectedTeamKey.split(':')
        url += `?domainId=${dId}&wing=${dWing}`
      } else {
        // Default to showing all teams (Admin view)
        url += '?all=true'
      }
      
      const res = await fetch(url)
      const data = await res.json()
      
      if (res.ok) {
        setMyTeams(data.myTeams || [])
        setPortfolio(data.portfolio || [])
        // Default selection removed to allow "All Teams" view by default
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedTeamKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleRow = (key: string) => {
    const newSet = new Set(expandedRows)
    if (newSet.has(key)) newSet.delete(key)
    else newSet.add(key)
    setExpandedRows(newSet)
  }

  const selectedTeam = myTeams.find(t => `${t.id}:${t.wing}` === selectedTeamKey)
  // If selectedTeamKey is set, filter. If not, show all.
  const filteredPortfolio = selectedTeamKey 
    ? portfolio.filter(p => `${p.team.id}:${p.team.wing}` === selectedTeamKey)
    : portfolio
  
  // Find selected domain name if not in myTeams
  const selectedDomainName = selectedTeam?.name || allDomains.find(d => d.id === selectedTeamKey.split(':')[0])?.name || ''
  const selectedWingStr = selectedTeam?.wing || selectedTeamKey.split(':')[1] || ''

  // Group portfolio by team for Card View
  const portfolioByTeam = useMemo(() => {
    const grouped = new Map<string, PortfolioItem[]>()
    
    // Ensure all myTeams are initialized even if empty portfolio (optional, but good for completeness)
    // If selectedTeamKey is set, we only care about that team.
    // If not, we care about all myTeams.
    const teamsToShow = selectedTeamKey ? (selectedTeam ? [selectedTeam] : []) : myTeams

    teamsToShow.forEach(team => {
      grouped.set(`${team.id}:${team.wing}`, [])
    })

    filteredPortfolio.forEach(item => {
      const key = `${item.team.id}:${item.team.wing}`
      if (!grouped.has(key)) {
        // If portfolio contains items for teams not in myTeams (e.g. if we fetched by ID but not in myTeams list?), add it
        grouped.set(key, [])
      }
      grouped.get(key)?.push(item)
    })
    
    return grouped
  }, [filteredPortfolio, myTeams, selectedTeamKey, selectedTeam])

  const uniqueTargets = useMemo(() => {
    const targets = new Map<string, string>()
    filteredPortfolio.forEach(p => {
      targets.set(p.target.id, p.target.name)
    })
    return Array.from(targets.entries()).map(([id, name]) => ({ id, name }))
  }, [filteredPortfolio])

  if (loading && allDomains.length === 0) {
    return (
      <div className="p-8 text-center animate-pulse">...</div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('selectTeam')}</label>
            <div className="relative">
              <select
                className="w-full bg-site-bg border border-site-border rounded p-2 appearance-none"
                value={selectedTeamKey}
                onChange={(e) => setSelectedTeamKey(e.target.value)}
              >
                <option value="">{t('allMyTeamsLabel')}</option>
                {myTeams.map(team => (
                  <option key={`${team.id}:${team.wing}`} value={`${team.id}:${team.wing}`}>
                    {team.name} ({team.wing === 'RIGHT' ? tWings('right') : tWings('left')})
                  </option>
                ))}
                <optgroup label={t('allDomains')}>
                  {allDomains.map(d => (
                    <React.Fragment key={d.id}>
                      <option value={`${d.id}:RIGHT`}>{d.name} ({tWings('right')})</option>
                      <option value={`${d.id}:LEFT`}>{d.name} ({tWings('left')})</option>
                    </React.Fragment>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="absolute left-2 top-3 w-4 h-4 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('selectAsset')}</label>
            <div className="relative">
              <select
                className="w-full bg-site-bg border border-site-border rounded p-2 appearance-none"
                value={highlightedAssetId}
                onChange={(e) => setHighlightedAssetId(e.target.value)}
              >
                <option value="">{t('allAssets')}</option>
                {allDomains.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-2 top-3 w-4 h-4 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2">
          {viewMode === 'cards' && (
             <button
               onClick={() => setShowLegend(!showLegend)}
               className={`p-2 rounded border ${showLegend ? 'bg-site-secondary text-site-text border-site-border' : 'border-transparent text-site-muted hover:text-site-text'}`}
               title={t('legendTitle')}
             >
               <Info size={20} />
             </button>
           )}
           <button 
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded border ${viewMode === 'cards' ? 'bg-site-secondary text-site-text border-site-border' : 'border-transparent text-site-muted hover:text-site-text'}`}
            title={t('viewVisual')}
          >
            <BarChart3 size={20} />
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={`p-2 rounded border ${viewMode === 'table' ? 'bg-site-secondary text-site-text border-site-border' : 'border-transparent text-site-muted hover:text-site-text'}`}
            title={t('viewTable')}
          >
            <FileText size={20} />
          </button>
        </div>
      </div>

      {showLegend && viewMode === 'cards' && (
        <div className="bg-site-secondary/10 border border-site-border rounded p-4 mb-8 animate-in fade-in slide-in-from-top-2">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Info size={16} />
            {t('legendTitle')}
          </h3>
          <div className="flex flex-wrap gap-4">
            {uniqueTargets.map(target => (
              <div key={target.id} className="flex items-center gap-2 bg-site-bg/50 px-2 py-1 rounded border border-site-border/50">
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: stringToColor(target.id) }}
                />
                <span className="text-xs">{target.name}</span>
              </div>
            ))}
            {uniqueTargets.length === 0 && (
              <span className="text-xs text-site-muted">{t('noHoldings')}</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20">{t('loading')}...</div>
      ) : (
        <>
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 mb-8">
              {Array.from(portfolioByTeam.entries()).map(([key, items]) => {
                const [id, wing] = key.split(':')
                // Try to find name in myTeams or items or allDomains
                const teamName = myTeams.find(t => t.id === id && t.wing === wing)?.name 
                  || items[0]?.team.name 
                  || allDomains.find(d => d.id === id)?.name 
                  || 'Unknown Team'
                
                return (
                  <div key={key} className="h-full">
                    <TeamPortfolioCard 
                      teamName={teamName}
                      wing={wing}
                      items={items}
                      highlightedDomainId={highlightedAssetId}
                    />
                  </div>
                )
              })}
              {portfolioByTeam.size === 0 && (
                <div className="col-span-full text-center py-10 text-site-muted">
                  {t('noHoldings')}
                </div>
              )}
            </div>
          )}

          {viewMode === 'table' && (
            /* Portfolio Table */
            <div className="card p-0 overflow-hidden border border-site-border bg-site-secondary/10">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-site-secondary/50 text-site-muted text-xs border-b border-site-border">
                    <tr>
                      <th className="px-6 py-4 font-medium w-12"></th>
                      <th className="px-6 py-4 font-medium">{t('holdingsTable.target')}</th>
                      <th className="px-6 py-4 font-medium text-center">{t('holdingsTable.permanent')}</th>
                      <th className="px-6 py-4 font-medium text-center text-red-400">{t('holdingsTable.lent')}</th>
                      <th className="px-6 py-4 font-medium text-center text-green-400">{t('holdingsTable.borrowed')}</th>
                      <th className="px-6 py-4 font-medium text-center">{t('holdingsTable.effective')}</th>
                      <th className="px-6 py-4 font-medium text-center text-blue-400">{t('holdingsTable.claims')}</th>
                      <th className="px-6 py-4 font-medium text-center text-orange-400">{t('holdingsTable.obligations')}</th>
                      <th className="px-6 py-4 font-medium text-center">{t('holdingsTable.myPower')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-site-border/50">
                    {filteredPortfolio.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-site-muted italic">
                          {t('noHoldings')}
                        </td>
                      </tr>
                    ) : (
                      filteredPortfolio.map((item) => {
                        const key = `${item.target.id}:${item.target.wing}`
                        const isExpanded = expandedRows.has(key)
                        
                        return (
                          <Fragment key={key}>
                            <tr 
                              className={`transition-colors cursor-pointer ${isExpanded ? 'bg-site-secondary/30' : 'hover:bg-site-secondary/20'}`}
                              onClick={() => toggleRow(key)}
                            >
                              <td className="px-6 py-4 text-center">
                                {item.contracts.length > 0 && (
                                  <ChevronRight size={16} className={`transition-transform text-site-muted ${isExpanded ? 'rotate-90' : ''}`} />
                                )}
                              </td>
                              <td className="px-6 py-4 font-medium text-site-text">
                                <div className="flex flex-col">
                                  <span className="text-base">{item.target.name}</span>
                                  <span className={`text-xs font-normal ${item.target.wing === 'RIGHT' ? 'text-blue-400' : 'text-green-400'}`}>
                                    {tWings(item.target.wing.toLowerCase())}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center text-site-muted font-mono">
                                {item.stats.permanent}%
                              </td>
                              <td className="px-6 py-4 text-center text-red-400 font-mono">
                                {item.stats.lent > 0 ? `-${item.stats.lent}%` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center text-green-400 font-mono">
                                {item.stats.borrowed > 0 ? `+${item.stats.borrowed}%` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-warm-primary text-lg font-mono">
                                {item.stats.effective}%
                              </td>
                              <td className="px-6 py-4 text-center text-blue-400 font-mono">
                                {item.stats.claims > 0 ? `+${item.stats.claims}%` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center text-orange-400 font-mono">
                                {item.stats.obligations > 0 ? `-${item.stats.obligations}%` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-warm-accent font-mono">
                                {item.stats.myPower.toFixed(2)} pts
                              </td>
                            </tr>
                            
                            {isExpanded && item.contracts.length > 0 && (
                              <tr className="bg-site-secondary/10">
                                <td colSpan={9} className="px-6 py-4 border-t border-site-border/30 shadow-inner">
                                  <div className="space-y-2 pl-4 border-r-2 border-site-border/50">
                                    <h4 className="text-xs font-bold text-site-muted mb-2 flex items-center gap-2">
                                      <FileText size={14} />
                                      {t('holdingsTable.contracts')}
                                    </h4>
                                    {item.contracts.map(c => (
                                      <div key={c.id} className="flex items-center gap-4 text-xs bg-site-bg/50 p-2 rounded border border-site-border/30">
                                        <span className={`px-1.5 py-0.5 rounded ${c.type === 'OUTBOUND' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                          {c.type === 'OUTBOUND' ? 'OUT' : 'IN'}
                                        </span>
                                        <span className="text-site-muted">
                                          {c.type === 'OUTBOUND' 
                                            ? `Invested ${c.percentageInvested}% / Return ${c.percentageReturn}%` 
                                            : `Received ${c.percentageInvested}% / Giving ${c.percentageReturn}%`
                                          }
                                        </span>
                                        {c.endDate && (
                                          <span className="ml-auto text-site-muted">
                                            End: {new Date(c.endDate).toLocaleDateString('en-GB')}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
