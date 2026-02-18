'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { PieChart, TrendingUp, Users, Award, ChevronDown, ChevronRight, Activity, FileText } from 'lucide-react'

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
      }
      
      const res = await fetch(url)
      const data = await res.json()
      
      if (res.ok) {
        setMyTeams(data.myTeams || [])
        setPortfolio(data.portfolio || [])
        
        // Select first team by default if none selected AND no specific selection
        if (!selectedTeamKey && data.myTeams?.length > 0) {
          const first = data.myTeams[0]
          setSelectedTeamKey(`${first.id}:${first.wing}`)
        }
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
  const teamPortfolio = portfolio.filter(p => `${p.team.id}:${p.team.wing}` === selectedTeamKey)
  
  // Find selected domain name if not in myTeams
  const selectedDomainName = selectedTeam?.name || allDomains.find(d => d.id === selectedTeamKey.split(':')[0])?.name || ''
  const selectedWingStr = selectedTeam?.wing || selectedTeamKey.split(':')[1] || ''

  if (loading && allDomains.length === 0) return <div className="p-8 text-center animate-pulse">...</div>

  return (
    <div className="space-y-8">
      {/* Header & Team Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-site-text flex items-center gap-2">
            <PieChart className="text-warm-primary" />
            {t('title')}
          </h2>
        </div>
        
        <div className="w-full md:w-auto min-w-[300px]">
          <label className="text-xs text-site-muted mb-1 block px-1">{t('selectTeam')}</label>
          <div className="relative">
            <select
              value={selectedTeamKey}
              onChange={(e) => setSelectedTeamKey(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-site-border bg-site-secondary/50 text-site-text text-sm appearance-none outline-none focus:ring-2 focus:ring-warm-primary"
            >
              <option value="">{t('selectTeam')}...</option>
              {allDomains.map(d => (
                <>
                  <option key={`${d.id}:RIGHT`} value={`${d.id}:RIGHT`}>
                    {d.name} - {tWings('right')}
                  </option>
                  <option key={`${d.id}:LEFT`} value={`${d.id}:LEFT`}>
                    {d.name} - {tWings('left')}
                  </option>
                </>
              ))}
            </select>
            <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-site-muted pointer-events-none" size={16} />
          </div>
        </div>
      </div>

      {(selectedTeam || selectedTeamKey) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card bg-site-secondary/20 border-warm-primary/20 flex items-center gap-4">
            <div className="p-3 rounded-full bg-warm-primary/10 text-warm-primary">
              <Award size={24} />
            </div>
            <div>
              <div className="text-sm text-site-muted">{t('myRole')}</div>
              <div className="text-xl font-bold text-site-text">{selectedTeam?.role || 'VIEWER'}</div>
            </div>
          </div>
          {/* Add more summary cards if needed */}
        </div>
      )}

      {/* Portfolio Table */}
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
              {teamPortfolio.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-site-muted italic">
                    {t('noHoldings')}
                  </td>
                </tr>
              ) : (
                teamPortfolio.map((item) => {
                  const key = `${item.target.id}:${item.target.wing}`
                  const isExpanded = expandedRows.has(key)
                  
                  return (
                    <>
                      <tr 
                        key={key} 
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
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
