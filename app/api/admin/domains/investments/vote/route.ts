import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveShare } from '@/lib/voting-utils'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { investmentId, vote } = await req.json()

    if (!investmentId || !vote) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const investment = await prisma.domainInvestment.findUnique({
      where: { id: investmentId },
      include: {
        proposerDomain: true,
        targetDomain: true
      }
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment proposal not found' }, { status: 404 })
    }

    if (investment.status !== 'PENDING') {
      return NextResponse.json({ error: 'Investment is no longer pending' }, { status: 400 })
    }

    // Check if voter is expert in proposer or target domain (specific wing)
    const proposerMembership = await prisma.domainExpert.findFirst({
      where: { 
        userId: session.user.id, 
        domainId: investment.proposerDomainId,
        wing: investment.proposerWing
      }
    })

    const targetMembership = await prisma.domainExpert.findFirst({
      where: { 
        userId: session.user.id, 
        domainId: investment.targetDomainId,
        wing: investment.targetWing
      }
    })

    if (!proposerMembership && !targetMembership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'You are not an expert in the affected wing of the domain' }, { status: 403 })
    }

    const affectedDomains = []
    if (proposerMembership || session.user.role === 'ADMIN') affectedDomains.push(investment.proposerDomainId)
    if (targetMembership || session.user.role === 'ADMIN') affectedDomains.push(investment.targetDomainId)

    // Record votes
    for (const dId of affectedDomains) {
      await prisma.domainInvestmentVote.upsert({
        where: {
          investmentId_voterId_domainId: {
            investmentId,
            voterId: session.user.id,
            domainId: dId
          }
        },
        update: { vote },
        create: {
          investmentId,
          voterId: session.user.id,
          domainId: dId,
          vote
        }
      })
    }

    // Check for consensus
    const getWeightedCounts = async (domainId: string, investmentId: string, wing: string) => {
      const experts = await prisma.domainExpert.findMany({ 
        where: { 
          domainId,
          wing: wing // Filter by wing
        } 
      })
      const totalPoints = experts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      
      const votes = await prisma.domainInvestmentVote.findMany({
        where: { investmentId, domainId }
      })
      
      const expertMap = new Map(experts.map(e => [e.userId, e.role]))
      
      let approvedPoints = 0
      let rejectedPoints = 0
      
      for (const v of votes) {
        const role = expertMap.get(v.voterId)
        if (role) {
          const points = role === 'HEAD' ? 2 : 1
          if (v.vote === 'APPROVE') approvedPoints += points
          else if (v.vote === 'REJECT') rejectedPoints += points
        }
      }
      
      return { totalPoints, approvedPoints, rejectedPoints }
    }

    const proposerStats = await getWeightedCounts(investment.proposerDomainId, investmentId, investment.proposerWing)
    const targetStats = await getWeightedCounts(investment.targetDomainId, investmentId, investment.targetWing)

    const proposerThreshold = proposerStats.totalPoints <= 2 ? 1 : Math.floor(proposerStats.totalPoints / 2) + 1
    const targetThreshold = targetStats.totalPoints <= 2 ? 1 : Math.floor(targetStats.totalPoints / 2) + 1

    if (proposerStats.rejectedPoints >= proposerThreshold || targetStats.rejectedPoints >= targetThreshold) {
      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED' })
    }

    if (proposerStats.approvedPoints >= proposerThreshold && targetStats.approvedPoints >= targetThreshold) {
      // Validate share availability before activation
      // 1. Check if Proposer Wing has enough shares to give (percentageInvested)
      const proposerEffective = await getEffectiveShare(
        investment.proposerDomainId, 
        investment.proposerDomainId, 
        investment.proposerWing, 
        investment.proposerWing
      )
      
      if (proposerEffective < investment.percentageInvested) {
        return NextResponse.json({ 
          error: `Activation failed: Proposer wing (${investment.proposerWing}) has insufficient effective shares (${proposerEffective.toFixed(2)}%)` 
        }, { status: 409 })
      }

      // 2. Check if Target Wing has enough shares to return (percentageReturn)
      const targetEffective = await getEffectiveShare(
        investment.targetDomainId, 
        investment.targetDomainId, 
        investment.targetWing, 
        investment.targetWing
      )

      if (targetEffective < investment.percentageReturn) {
        return NextResponse.json({ 
          error: `Activation failed: Target wing (${investment.targetWing}) has insufficient effective shares (${targetEffective.toFixed(2)}%)` 
        }, { status: 409 })
      }

      // ACTIVATE INVESTMENT
      const startDate = new Date()
      const endDate = new Date()
      endDate.setFullYear(startDate.getFullYear() + investment.durationYears)

      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { 
          status: 'ACTIVE',
          startDate,
          endDate
        }
      })
      return NextResponse.json({ status: 'ACTIVE' })
    }

    return NextResponse.json({ status: 'PENDING' })
  } catch (error) {
    console.error('Error voting on investment:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
