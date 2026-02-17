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

    // 1. Get User's Teams (Expertise)
    const myExpertise = await prisma.domainExpert.findMany({
      where: { userId: session.user.id },
      include: { domain: { select: { id: true, name: true, slug: true } } }
    })

    // If filters provided, verify user has access or is admin
    let teamsToAnalyze = myExpertise.map(e => ({
      domainId: e.domainId,
      domainName: e.domain.name,
      wing: e.wing,
      role: e.role,
      userId: e.userId
    }))

    if (filterDomainId && filterWing) {
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
    }

    const portfolio = []

    for (const team of teamsToAnalyze) {
      // A. Get Permanent Shares (What this team owns)
      const shares = await prisma.domainVotingShare.findMany({
        where: {
          ownerDomainId: team.domainId,
          ownerWing: team.wing
        },
        include: {
          domain: { select: { id: true, name: true, slug: true } }
        }
      })

      // B. Get Active Outbound Investments (What this team invested in others)
      // "Invested" means we gave power to them. Wait, "Portfolio" usually means what we HAVE.
      // If we invested in X, we gave X power. We don't "have" it anymore temporarily.
      // But we might have "Returns" from others.
      // Let's stick to "Effective Share" which accounts for all this.
      
      // We need to find all "Targets" where this team might have power.
      // 1. Where they have permanent shares.
      // 2. Where they have incoming returns (Investments where Proposer=Team, Target=?, Return>0) -> We gain power in Proposer (Self)? No.
      // Let's look at getEffectiveShare logic again.
      // External Share (Owner in Target):
      // + Permanent Share
      // + Returns (from Investment where Owner=Proposer, Target=Target) -> Wait.
      //   If Owner is Proposer, and we have percentageReturn, it means Target gave us back power?
      //   Schema: percentageReturn "percentage of voting power transferred from target to proposer".
      //   Yes. So if we (Proposer) invested in Target, and got Return, we HAVE power in Target.
      // + Invested (from Investment where Target=Owner, Proposer=Target) ->
      //   Target (Proposer) gave us (Target) power.

      // So, relevant targets are:
      // 1. domains in `shares`
      // 2. `targetDomainId` from investments where proposer=team (and percentageReturn > 0)
      // 3. `proposerDomainId` from investments where target=team (and percentageInvested > 0)

      const investmentsAsProposer = await prisma.domainInvestment.findMany({
        where: { proposerDomainId: team.domainId, proposerWing: team.wing, status: 'ACTIVE' }
      })

      const investmentsAsTarget = await prisma.domainInvestment.findMany({
        where: { targetDomainId: team.domainId, targetWing: team.wing, status: 'ACTIVE' }
      })

      const targetIds = new Set<string>()
      
      // Add shares targets
      shares.forEach(s => targetIds.add(`${s.domainId}:${s.domainWing}`)) // composite key
      
      // Add investment targets (where we might have power)
      investmentsAsProposer.forEach(inv => {
        if (inv.percentageReturn > 0) targetIds.add(`${inv.targetDomainId}:${inv.targetWing}`)
      })
      investmentsAsTarget.forEach(inv => {
        if (inv.percentageInvested > 0) targetIds.add(`${inv.proposerDomainId}:${inv.proposerWing}`)
      })

      // Also include Self (Internal Power)
      targetIds.add(`${team.domainId}:${team.wing}`)

      // Pre-calculate Total Points for this Team (to avoid N+1 in loop)
      let teamTotalPoints = 0
      let myPoints = 0
      if (team.role !== 'ADMIN') {
         const teamExperts = await prisma.domainExpert.findMany({
           where: { domainId: team.domainId, wing: team.wing },
           select: { role: true }
         })
         teamTotalPoints = teamExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
         
         if (team.role === 'HEAD') myPoints = 2
         else if (team.role === 'VIEWER') myPoints = 0
         else myPoints = 1
      }

      // Collect all unique Target IDs to bulk fetch details
      const uniqueDomainIds = new Set<string>()
      targetIds.forEach(key => uniqueDomainIds.add(key.split(':')[0]))
      uniqueDomainIds.add(team.domainId) // Ensure self is included

      const domainsMap = new Map()
      const domainsList = await prisma.domain.findMany({
        where: { id: { in: Array.from(uniqueDomainIds) } },
        select: { id: true, name: true, slug: true }
      })
      domainsList.forEach(d => domainsMap.set(d.id, d))

      // Calculate stats for each target
      for (const compositeKey of Array.from(targetIds)) {
        const [targetId, targetWing] = compositeKey.split(':')
        const targetDomain = domainsMap.get(targetId)
        
        if (!targetDomain) continue

        const effectiveShare = await getEffectiveShare(team.domainId, targetId, team.wing, targetWing)
        
        // Calculate my personal voting power in this target via this team
        let myPower = 0
        if (teamTotalPoints > 0) {
           myPower = (effectiveShare / teamTotalPoints) * myPoints
        }

        // Find breakdown components
        const permanent = shares.find(s => s.domainId === targetId && s.domainWing === targetWing)?.percentage || 0
        
        // Active Contracts affecting this relation
        const relevantInvestments = [
          ...investmentsAsProposer.filter(i => i.targetDomainId === targetId && i.targetWing === targetWing),
          ...investmentsAsTarget.filter(i => i.proposerDomainId === targetId && i.proposerWing === targetWing)
        ]

        if (effectiveShare > 0 || permanent > 0 || relevantInvestments.length > 0) {
          portfolio.push({
            team: { id: team.domainId, name: team.domainName, wing: team.wing },
            target: { id: targetDomain.id, name: targetDomain.name, wing: targetWing },
            stats: {
              permanent,
              effective: effectiveShare,
              myPower
            },
            contracts: relevantInvestments.map(i => ({
              id: i.id,
              type: i.proposerDomainId === team.domainId ? 'OUTBOUND' : 'INBOUND',
              percentageInvested: i.percentageInvested,
              percentageReturn: i.percentageReturn,
              endDate: i.endDate
            }))
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
      portfolio 
    })

  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
