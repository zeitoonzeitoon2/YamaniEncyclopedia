'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { ChevronDown, Info } from 'lucide-react'
import TeamPortfolioCard, { stringToColor, PortfolioItem } from './TeamPortfolioCard'

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
      // If "All Teams" is selected, we want to show ALL domains (Right & Left)
      // merging myTeams is not enough if we want to show EVERYTHING available in the system.
      // So we generate list from allDomains.
      teamsToInit = allDomains.flatMap(d => [
        { id: d.id, name: d.name, wing: 'RIGHT' },
        { id: d.id, name: d.name, wing: 'LEFT' }
      ])
    }

    // Initialize map entries
    teamsToInit.forEach(team => {
      grouped.set(`${team.id}:${team.wing}`, [])
    })

    // Populate with actual data
    filteredPortfolio.forEach(item => {
      const key = `${item.team.id}:${item.team.wing}`
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)?.push(item)
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 mb-8">
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
        </>
      )}
    </div>
  )
}
