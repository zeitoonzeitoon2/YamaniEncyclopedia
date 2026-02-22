import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveShare } from '@/lib/voting-utils'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const filterDomainId = searchParams.get('domainId')
    const filterWing = searchParams.get('wing')
    const filterAll = searchParams.get('all')

    // 1. Get User's Teams (Expertise)
    const myExpertise = await prisma.domainExpert.findMany({
      where: { userId: session.user.id },
      include: { domain: { select: { id: true, name: true, slug: true } } }
    })

    let teamsToAnalyze: any[] = []

    if (filterAll === 'true') {
      // Fetch ALL domains for admin view
       const allDomains = await prisma.domain.findMany({
         select: { id: true, name: true }
       })
       
       // Add both wings for each domain
       teamsToAnalyze = allDomains.flatMap(d => [
         {
           domainId: d.id,
           domainName: d.name,
           wing: 'RIGHT',
           role: 'VIEWER',
           userId: session.user.id
         },
         {
           domainId: d.id,
           domainName: d.name,
           wing: 'LEFT',
           role: 'VIEWER',
           userId: session.user.id
         }
       ])
    } else if (filterDomainId && filterWing) {
      // Allow viewing any team's portfolio (Public Transparency)
      const domain = await prisma.domain.findUnique({ where: { id: filterDomainId } })
      if (domain) {
        // Check if user is actually a member to set correct role
        const memberRecord = myExpertise.find(e => e.domainId === filterDomainId && e.wing === filterWing)
        
        teamsToAnalyze = [{
          domainId: domain.id,
          domainName: domain.name,
          wing: filterWing,
          role: memberRecord ? memberRecord.role : 'VIEWER',
          userId: session.user.id
        }]
      }
    } else {
      // Default: Show My Teams
      teamsToAnalyze = myExpertise.map(e => ({
        domainId: e.domainId,
        domainName: e.domain.name,
        wing: e.wing,
        role: e.role,
        userId: e.userId
      }))
    }

    // 2. Bulk Fetch All Necessary Data
    const [allShares, allInvestments, allExperts, allDomains] = await Promise.all([
      prisma.domainVotingShare.findMany({
        include: { domain: { select: { id: true, name: true } } }
      }),
      prisma.domainInvestment.findMany({
        where: { status: { in: ['ACTIVE', 'COMPLETED', 'RETURNED'] } }
      }),
      prisma.domainExpert.findMany({
        select: { domainId: true, wing: true, role: true }
      }),
      prisma.domain.findMany({
        select: { id: true, name: true, slug: true }
      })
    ])

    const domainsMap = new Map(allDomains.map(d => [d.id, d]))

    // 3. Pre-calculate "Effective Shares" (Who owns what)
    // We need to map: Target -> [Owners] to calculate Remainder (Self-Share)
    // Then invert to: Owner -> [Targets] to build Portfolio
    
    type ShareInfo = {
      ownerId: string
      ownerWing: string
      percentage: number
      source: 'PERMANENT' | 'INVESTMENT' | 'SELF'
      // Keep track of breakdown directly in ShareInfo to avoid loss during merge
      breakdown: {
        permanent: number
        temporary: number
      }
    }

    const sharesByTarget = new Map<string, ShareInfo[]>()

    // Helper to add share
    const addShare = (targetKey: string, info: ShareInfo) => {
      if (!sharesByTarget.has(targetKey)) sharesByTarget.set(targetKey, [])
      const list = sharesByTarget.get(targetKey)!
      const existing = list.find(s => s.ownerId === info.ownerId && s.ownerWing === info.ownerWing)
      if (existing) {
        existing.percentage += info.percentage
        existing.breakdown.permanent += info.breakdown.permanent
        existing.breakdown.temporary += info.breakdown.temporary
      } else {
        list.push(info)
      }
    }

    // A. Explicit Shares
    allShares.forEach(s => {
      addShare(`${s.domainId}:${s.domainWing}`, {
        ownerId: s.ownerDomainId,
        ownerWing: s.ownerWing,
        percentage: s.percentage,
        source: 'PERMANENT',
        breakdown: { permanent: s.percentage, temporary: 0 }
      })
    })

    // B. Investment Shares
    allInvestments.forEach(inv => {
      // Case 1: Target <- Proposer (Return) - Treated as Permanent Acquisition (Profit)
      if ((inv.status === 'COMPLETED' || inv.status === 'RETURNED') && inv.percentageReturn > 0) {
        addShare(`${inv.targetDomainId}:${inv.targetWing}`, {
          ownerId: inv.proposerDomainId,
          ownerWing: inv.proposerWing,
          percentage: inv.percentageReturn,
          source: 'INVESTMENT',
          breakdown: { permanent: inv.percentageReturn, temporary: 0 }
        })
      }
      // Case 2: Proposer -> Target (Invested) -> Target owns Proposer
      // Active Investment: Target holds Proposer's power temporarily
      if (inv.status === 'ACTIVE' && inv.percentageInvested > 0) {
        addShare(`${inv.proposerDomainId}:${inv.proposerWing}`, {
          ownerId: inv.targetDomainId,
          ownerWing: inv.targetWing,
          percentage: inv.percentageInvested,
          source: 'INVESTMENT',
          breakdown: { permanent: 0, temporary: inv.percentageInvested }
        })
      }
    })

    // C. Calculate Self-Share (Remainder)
    // We need to do this for ALL domains that have any shares defined, 
    // PLUS any domain in our teamsToAnalyze list (in case they have no external shares yet)
    const allTargetKeys = new Set(sharesByTarget.keys())
    teamsToAnalyze.forEach(t => allTargetKeys.add(`${t.domainId}:${t.wing}`))
    
    allTargetKeys.forEach(targetKey => {
      const list = sharesByTarget.get(targetKey) || []
      const [tId, tWing] = targetKey.split(':')
      
      // Separate Self from Others to recalculate correct Self Share
      // This handles cases where Permanent Share (100%) + Investment (20%) resulted in >100%
      // and fixes the issue where Self Share defaulted to RIGHT wing causing duplicates for LEFT wing teams
      const others = list.filter(s => !(s.ownerId === tId && s.ownerWing === tWing))
      
      const totalExternal = others.reduce((sum, s) => sum + s.percentage, 0)
      const correctSelfPercent = Math.max(0, 100 - totalExternal)
      
      // Reconstruct the list with corrected Self Share
      const newList = [...others]
      
      // Only RIGHT wing starts with 100% ownership.
      // LEFT wing starts with 0%, so it should not have a "Self Share" unless explicitly given.
      // However, if LEFT wing has unassigned shares (remainder), they belong to the RIGHT wing initially.
      if (correctSelfPercent > 0) {
        if (tWing === 'RIGHT') {
          newList.push({
            ownerId: tId,
            ownerWing: 'RIGHT', // Self share
            percentage: correctSelfPercent,
            source: 'SELF',
            breakdown: { permanent: correctSelfPercent, temporary: 0 }
          })
        }
        // LEFT wing: Do NOT assign remainder to anyone. It simply doesn't exist yet.
      }
      sharesByTarget.set(targetKey, newList)
    })

    // 4. Invert to get Portfolio: Owner -> [Targets]
    const portfolioByOwner = new Map<string, { targetKey: string, percentage: number, breakdown: { permanent: number, temporary: number } }[]>()
    
    sharesByTarget.forEach((shares, targetKey) => {
      shares.forEach(share => {
        const ownerKey = `${share.ownerId}:${share.ownerWing}`
        if (!portfolioByOwner.has(ownerKey)) portfolioByOwner.set(ownerKey, [])
        portfolioByOwner.get(ownerKey)!.push({
          targetKey: targetKey,
          percentage: share.percentage,
          breakdown: share.breakdown
        })
      })
    })

    // 5. Pre-calculate Team Points (for My Power)
    const teamPointsMap = new Map<string, number>()
    const expertsByTeam = new Map<string, typeof allExperts>()
    
    allExperts.forEach(e => {
      const key = `${e.domainId}:${e.wing}`
      if (!expertsByTeam.has(key)) expertsByTeam.set(key, [])
      expertsByTeam.get(key)!.push(e)
    })

    teamsToAnalyze.forEach(team => {
      const key = `${team.domainId}:${team.wing}`
      const experts = expertsByTeam.get(key) || []
      const points = experts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      teamPointsMap.set(key, points)
    })

    // 6. Generate Final Portfolio
    const portfolio = []

    for (const team of teamsToAnalyze) {
      const teamKey = `${team.domainId}:${team.wing}`
      const teamTotalPoints = teamPointsMap.get(teamKey) || 0
      
      // Calculate My Points in this team
      let myPoints = 0
      if (team.role === 'HEAD') myPoints = 2
      else if (team.role === 'VIEWER') myPoints = 0
      else if (team.role) myPoints = 1 // MEMBER

      // Get all targets where this team has "Effective Share"
      const effectiveHoldings = portfolioByOwner.get(teamKey) || []
      
      // Also need "Investments" data (Lent/Borrowed) even if Effective Share is 0?
      // The previous logic looped through "Active Investments" to find targets.
      // Let's gather all relevant target keys for this team.
      const relevantTargetKeys = new Set<string>()
      effectiveHoldings.forEach(h => relevantTargetKeys.add(h.targetKey))
      
      // Add targets from Active Investments (Lent/Borrowed)
      const investmentsAsProposer = allInvestments.filter(i => i.proposerDomainId === team.domainId && i.proposerWing === team.wing && i.status === 'ACTIVE')
      const investmentsAsTarget = allInvestments.filter(i => i.targetDomainId === team.domainId && i.targetWing === team.wing && i.status === 'ACTIVE')
      
      investmentsAsProposer.forEach(i => relevantTargetKeys.add(`${i.targetDomainId}:${i.targetWing}`))
      investmentsAsTarget.forEach(i => relevantTargetKeys.add(`${i.proposerDomainId}:${i.proposerWing}`))

      // Ensure Self is included
      relevantTargetKeys.add(teamKey)

      for (const targetKey of Array.from(relevantTargetKeys)) {
        const [targetId, targetWing] = targetKey.split(':')
        const targetDomain = domainsMap.get(targetId)
        if (!targetDomain) continue

        // 1. Effective Share
        const holding = effectiveHoldings.find(h => h.targetKey === targetKey)
        const effectiveShare = holding ? holding.percentage : 0
        const effectivePermanent = holding ? holding.breakdown.permanent : 0
        const effectiveTemporary = holding ? holding.breakdown.temporary : 0

        // 2. My Power
        let myPower = 0
        if (teamTotalPoints > 0) {
           myPower = (effectiveShare / teamTotalPoints) * myPoints
        }

        // 3. Breakdown
        // Permanent (from DB directly, might differ from effectivePermanent if self-share logic varies)
        // But we trust effectivePermanent now as it includes Self + DB Permanent.
        
        // Lent (Outbound Active Investment)
        const lentInv = investmentsAsProposer.find(i => i.targetDomainId === targetId && i.targetWing === targetWing)
        const lent = lentInv ? lentInv.percentageInvested : 0
        const claims = lentInv ? lentInv.percentageReturn : 0 // Future return

        // Borrowed (Inbound Active Investment)
        const borrowedInv = investmentsAsTarget.find(i => i.proposerDomainId === targetId && i.proposerWing === targetWing)
        const borrowed = borrowedInv ? borrowedInv.percentageInvested : 0
        const obligations = borrowedInv ? borrowedInv.percentageReturn : 0

        if (effectiveShare > 0 || lent > 0 || borrowed > 0) {
          portfolio.push({
            team: { id: team.domainId, name: team.domainName, wing: team.wing },
            target: { id: targetDomain.id, name: targetDomain.name, wing: targetWing },
            stats: {
              permanent: effectivePermanent, // Use our calculated breakdown
              effective: effectiveShare,
              temporary: effectiveTemporary, // New field
              myPower,
              lent,
              borrowed,
              claims,
              obligations
            }
          })
        }
      }
    }

    return NextResponse.json({ 
      myTeams: myExpertise.map(e => ({
        id: e.domainId,
        name: e.domain.name,
        wing: e.wing,
        role: e.role
      })),
      portfolio,
      debug: { 
        teamsAnalyzed: teamsToAnalyze.length,
        totalShares: allShares.length 
      } 
    })

  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
