'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { ChevronDown, Info } from 'lucide-react'
import TeamPortfolioCard, { stringToColor, getContrastColor, PortfolioItem, COLOR_PALETTE } from './TeamPortfolioCard'

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
  const [showLegend, setShowLegend] = useState(false)
  const [highlightedAssetId, setHighlightedAssetId] = useState<string>('')
  const [contractIndexMap, setContractIndexMap] = useState<Record<string, number>>({})

  // Determine domain colors based on their index in allDomains
  // This ensures a deterministic, non-hash-based color assignment
  const domainColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (allDomains.length > 0) {
      allDomains.forEach((d, index) => {
        // Use the index modulo palette length to cycle through colors
        map.set(d.id, COLOR_PALETTE[index % COLOR_PALETTE.length])
      })
    }
    return map
  }, [allDomains])

  // Helper to get color for a domain ID
  const getDomainColor = (id: string) => {
    return domainColorMap.get(id) || stringToColor(id)
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch investments for ID mapping
      const invRes = await fetch('/api/admin/domains/investments?status=PENDING,ACTIVE')
      if (invRes.ok) {
        const invData = await invRes.json()
        const investments = invData.investments || []
        investments.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        const map: Record<string, number> = {}
        investments.forEach((inv: any, index: number) => {
          map[inv.id] = index + 1
        })
        setContractIndexMap(map)
      }

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

  const selectedTeam = myTeams.find(t => `${t.id}:${t.wing}` === selectedTeamKey)
  // If selectedTeamKey is set, filter. If not, show all.
  const filteredPortfolio = selectedTeamKey 
    ? portfolio.filter(p => `${p.team.id}:${p.team.wing}` === selectedTeamKey)
    : portfolio
  
  // Find selected domain name if not in myTeams
  const selectedDomainName = selectedTeam?.name || allDomains.find(d => d.id === selectedTeamKey.split(':')[0])?.name || ''
  const selectedWingStr = selectedTeam?.wing || selectedTeamKey.split(':')[1] || ''

  // Group portfolio by Domain for Card View (grouping Right and Left wings)
  const portfolioByDomain = useMemo(() => {
    const grouped = new Map<string, { right: PortfolioItem[], left: PortfolioItem[], name: string }>()
    
    // Determine which teams to initialize
    let teamsToInit: { id: string; name: string; wing: string }[] = []

    if (selectedTeamKey) {
      // If a specific team is selected
      if (selectedTeam) {
        teamsToInit = [selectedTeam]
      } else {
        // If selected via ID but not in myTeams (e.g. from All Domains list)
        const [dId, dWing] = selectedTeamKey.split(':')
        const dName = allDomains.find(d => d.id === dId)?.name || ''
        if (dId && dWing) {
          teamsToInit = [{ id: dId, name: dName, wing: dWing }]
        }
      }
    } else {
      // If "All Teams" is selected, we want to show ALL domains
      // Initialize with all domains, creating entries for both wings if not filtered
      teamsToInit = allDomains.flatMap(d => [
        { id: d.id, name: d.name, wing: 'RIGHT' },
        { id: d.id, name: d.name, wing: 'LEFT' }
      ])
    }

    // Initialize map entries
    teamsToInit.forEach(team => {
      if (!grouped.has(team.id)) {
        grouped.set(team.id, { right: [], left: [], name: team.name })
      }
    })

    // Populate with actual data
    filteredPortfolio.forEach(item => {
      const domainId = item.team.id
      if (!grouped.has(domainId)) {
        // Fallback name if not initialized
        grouped.set(domainId, { right: [], left: [], name: item.team.name })
      }
      
      const entry = grouped.get(domainId)!
      if (item.team.wing === 'RIGHT') {
        entry.right.push(item)
      } else {
        entry.left.push(item)
      }
    })
    
    return grouped
  }, [filteredPortfolio, myTeams, selectedTeamKey, selectedTeam, allDomains])

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
                className="w-full bg-site-bg border border-site-border rounded p-2 pl-10 appearance-none"
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
                    <Fragment key={d.id}>
                      <option value={`${d.id}:RIGHT`}>{d.name} ({tWings('right')})</option>
                      <option value={`${d.id}:LEFT`}>{d.name} ({tWings('left')})</option>
                    </Fragment>
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
                className="w-full bg-site-bg border border-site-border rounded p-2 pl-10 appearance-none"
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
           <button
             onClick={() => setShowLegend(!showLegend)}
             className={`p-2 rounded border ${showLegend ? 'bg-site-secondary text-site-text border-site-border' : 'border-transparent text-site-muted hover:text-site-text'}`}
             title={t('legendTitle')}
           >
             <Info size={20} />
           </button>
        </div>
      </div>

      {showLegend && (
        <div className="bg-site-secondary/10 border border-site-border rounded p-4 mb-8 animate-in fade-in slide-in-from-top-2">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Info size={16} />
            {t('legendTitle')}
          </h3>
          <div className="flex flex-wrap gap-4 items-center">
            {/* Legend for colors */}
            {uniqueTargets.map(target => (
              <div key={target.id} className="flex items-center gap-2 bg-site-bg/50 px-2 py-1 rounded border border-site-border/50">
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: getDomainColor(target.id) }}
                />
                <span className="text-xs">{target.name}</span>
              </div>
            ))}
            
            {/* Divider */}
            {uniqueTargets.length > 0 && <div className="w-px h-6 bg-site-border mx-2" />}

            {/* Legend for bar styles */}
            <div className="flex items-center gap-4 text-xs text-site-muted">
              <div className="flex items-center gap-2">
                 <div className="w-4 h-8 bg-gray-500 rounded-t"></div>
                 <span>{t('permanent')}</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-4 h-8 bg-gray-500 rounded-t" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)' }}></div>
                 <span>{t('temporaryShare')}</span>
              </div>
            </div>

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
            <div className="grid grid-cols-1 gap-6 mb-8">
              {Array.from(portfolioByDomain.entries()).map(([domainId, { right, left, name }]) => {
                const domainColor = getDomainColor(domainId)
                const textColor = getContrastColor(domainColor)
                return (
                  <div key={domainId} className="border border-site-border bg-site-secondary/5 rounded-lg overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-site-border bg-site-secondary/20 flex justify-center items-center">
                      <div 
                        className="px-4 py-1.5 rounded-md font-bold shadow-sm text-center"
                        style={{ 
                          backgroundColor: domainColor,
                          color: textColor,
                          textShadow: textColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.5)' : 'none'
                        }}
                      >
                        {name}
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 divide-x divide-site-border divide-x-reverse h-full">
                      {/* Right Wing */}
                      <div className="h-full min-h-[220px]">
                        <TeamPortfolioCard 
                          teamName={name}
                          wing="RIGHT"
                          items={right}
                          highlightedDomainId={highlightedAssetId}
                          contractIndexMap={contractIndexMap}
                          embedded={true}
                          getDomainColor={getDomainColor}
                        />
                      </div>
                      {/* Left Wing */}
                      <div className="h-full min-h-[220px]">
                        <TeamPortfolioCard 
                          teamName={name}
                          wing="LEFT"
                          items={left}
                          highlightedDomainId={highlightedAssetId}
                          contractIndexMap={contractIndexMap}
                          embedded={true}
                          getDomainColor={getDomainColor}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              {portfolioByDomain.size === 0 && (
                <div className="col-span-full text-center py-10 text-site-muted">
                  {t('noHoldings')}
                </div>
              )}
            </div>
        </>
      )}
    </div>
  )
}
