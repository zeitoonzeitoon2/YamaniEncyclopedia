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

        // Calculate Balance Sheet Components
        let lent = 0 // Outbound Invested (Assets that are temporarily gone) -> Wait, user sees it as "Given Away" (Liability/Loss of power)
        let borrowed = 0 // Inbound Invested (Power received)
        let claims = 0 // Outbound Return (Future Receivable)
        let obligations = 0 // Inbound Return (Future Payable)

        // Case 1: Self (Internal Power)
        if (team.domainId === targetId && team.wing === targetWing) {
           // We are looking at our own domain.
           // Lent = We gave power to others (Invested in others)
           // But wait, relevantInvestments filters by targetId=targetId.
           // If targetId=Self, then we are looking at Inbound Investments (Others investing in us)?
           // No. "Self" row means "How much power do I have in MYSELF".
           // This is reduced by what I gave away (Outbound Invested).
           // And reduced by what I promised to return (Inbound Return).
           
           // Actually, the loop iterates over "Targets".
           // If Target=Self, we are calculating "Effective Self-Governance".
           
           // Let's look at all ACTIVE investments to sum up totals correctly.
           
           // Outbound Investments (Proposer=Team)
           // - We gave away `percentageInvested` to Target. (Lent)
           // - We will receive `percentageReturn` from Target. (Claim)
           
           // Inbound Investments (Target=Team)
           // - We received `percentageInvested` from Proposer. (Borrowed)
           // - We must return `percentageReturn` to Proposer. (Obligation)
           
           // But here we are inside the loop for a SPECIFIC Target.
           
           if (targetId === team.domainId) {
             // Target is SELF.
             // We start with 100% (Permanent).
             // We lose what we gave to others (Outbound Invested).
             // We lose what we promised to others (Inbound Return) -> Only if it's considered "Reserved". 
             // But user says "Return" is future. So maybe we don't lose it yet?
             // Actually, if we promised to give 2% back, we still have it until we give it back.
             // So Effective Self = 100 - Outbound Invested + Inbound Invested (Others gave us power in ourselves? No, that's not possible. Proposer gives power of Proposer to Target.)
             
             // Let's stick to the definitions:
             // Investment: Proposer gives Proposer's power to Target.
             // So if I am Proposer, I lose power in Myself.
             // If I am Target, I gain power in Proposer (not Myself).
             
             // So for Target=Self:
             // Lent = Sum of all Outbound Invested.
             // Borrowed = 0 (Nobody gives me power in Myself, they give me power in Them).
             
             const allOutbound = await prisma.domainInvestment.aggregate({
               where: { proposerDomainId: team.domainId, proposerWing: team.wing, status: 'ACTIVE' },
               _sum: { percentageInvested: true, percentageReturn: true }
             })
             
             const allInbound = await prisma.domainInvestment.aggregate({
                where: { targetDomainId: team.domainId, targetWing: team.wing, status: 'ACTIVE' },
                _sum: { percentageReturn: true }
             })

             lent = allOutbound._sum.percentageInvested || 0
             // Inbound Return means I promised to give power back to Proposer. (Future Liability)
             obligations = allInbound._sum.percentageReturn || 0
             
             // Claims? I will receive power in Others. Not relevant to "Self" power.
             // Borrowed? I received power in Others. Not relevant to "Self" power.
             
           } else {
             // Target is EXTERNAL.
             // I have power in External if:
             // 1. I have Permanent Shares.
             // 2. I invested in them (Proposer=Me) -> I gave My power to Them. (Wait, investment gives power to TARGET).
             //    So if I invest in Them, THEY get power in ME.
             //    So I don't get power in Them.
             //    Unless there is a Return? Yes, Return gives Me power in Them. (Future Claim).
             
             // 3. They invested in Me (Target=Me) -> They gave Their power to Me.
             //    So I get power in Them. (Borrowed/Active Received).
             
             // So for Target=External:
             
             // Borrowed (Active Received) = Sum of Inbound Invested (where Proposer=External)
             const inboundFromTarget = investmentsAsTarget.filter(i => i.proposerDomainId === targetId && i.proposerWing === targetWing)
             borrowed = inboundFromTarget.reduce((sum, i) => sum + i.percentageInvested, 0)
             
             // Claims (Future Receivable) = Sum of Outbound Return (where Target=External)
             const outboundToTarget = investmentsAsProposer.filter(i => i.targetDomainId === targetId && i.targetWing === targetWing)
             claims = outboundToTarget.reduce((sum, i) => sum + i.percentageReturn, 0)
             
             // Obligations? (Future Payable)
             // If I invested in them, did I promise to give them power in ME? No, I gave them power in ME immediately.
             // If they invested in me, did I promise to return power in THEM? No, I promise to return power in ME.
             // So Obligations are always about power in Self.
           }

        } else {
           // Target is EXTERNAL
           
           // Borrowed (I have power in Target because Target invested in Me)
           // Target (Proposer) -> Me (Target). Investment = Power of Proposer (Target) given to Target (Me).
           const inbound = investmentsAsTarget.filter(i => i.proposerDomainId === targetId && i.proposerWing === targetWing)
           borrowed = inbound.reduce((sum, i) => sum + i.percentageInvested, 0)
           
           // Claims (I have future power in Target because I invested in Target)
           // Me (Proposer) -> Target (Target). Return = Power of Target given to Me.
           const outbound = investmentsAsProposer.filter(i => i.targetDomainId === targetId && i.targetWing === targetWing)
           claims = outbound.reduce((sum, i) => sum + i.percentageReturn, 0)
        }

        if (effectiveShare > 0 || permanent > 0 || relevantInvestments.length > 0 || claims > 0 || borrowed > 0) {
          portfolio.push({
            team: { id: team.domainId, name: team.domainName, wing: team.wing },
            target: { id: targetDomain.id, name: targetDomain.name, wing: targetWing },
            stats: {
              permanent,
              effective: effectiveShare,
              myPower,
              lent: (targetId === team.domainId) ? lent : 0, // Only show "Lent" (Given Away) on Self row
              borrowed,
              claims,
              obligations: (targetId === team.domainId) ? obligations : 0 // Only show "Obligations" on Self row
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
