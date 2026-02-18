import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEffectiveShare, getAvailableVotingPower } from '@/lib/voting-utils'

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
    if (proposerMembership) affectedDomains.push(investment.proposerDomainId)
    if (targetMembership) affectedDomains.push(investment.targetDomainId)

    // If user is ADMIN and not a member of any affected domain, allow voting for both (Super Admin Override)
    // But if they are a member of one, they only vote for that one.
    if (session.user.role === 'ADMIN' && affectedDomains.length === 0) {
      affectedDomains.push(investment.proposerDomainId)
      affectedDomains.push(investment.targetDomainId)
    }

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
    const getVoteCounts = async (domainId: string, investmentId: string, wing: string) => {
      const experts = await prisma.domainExpert.findMany({ 
        where: { 
          domainId,
          wing: wing
        } 
      })
      const totalPoints = experts.length // 1 person 1 vote
      
      const votes = await prisma.domainInvestmentVote.findMany({
        where: { investmentId, domainId }
      })
      
      const expertIds = new Set(experts.map(e => e.userId))
      
      let approvedPoints = 0
      let rejectedPoints = 0
      
      for (const v of votes) {
        if (expertIds.has(v.voterId)) {
          if (v.vote === 'APPROVE') approvedPoints += 1
          else if (v.vote === 'REJECT') rejectedPoints += 1
        }
      }
      
      return { totalPoints, approvedPoints, rejectedPoints }
    }

    const proposerStats = await getVoteCounts(investment.proposerDomainId, investmentId, investment.proposerWing)
    const targetStats = await getVoteCounts(investment.targetDomainId, investmentId, investment.targetWing)

    const proposerThreshold = Math.floor(proposerStats.totalPoints / 2) + 1
    const targetThreshold = Math.floor(targetStats.totalPoints / 2) + 1

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
      const proposerAvailable = await getAvailableVotingPower(
        investment.proposerDomainId, 
        investment.proposerWing
      )
      
      if (proposerAvailable < investment.percentageInvested) {
        return NextResponse.json({ 
          error: `Activation failed: Proposer wing (${investment.proposerWing}) has insufficient available shares (${proposerAvailable.toFixed(2)}%)` 
        }, { status: 409 })
      }

      // 2. Check if Target Wing has enough shares to return (percentageReturn)
      const targetAvailable = await getAvailableVotingPower(
        investment.targetDomainId, 
        investment.targetWing
      )

      if (targetAvailable < investment.percentageReturn) {
        return NextResponse.json({ 
          error: `Activation failed: Target wing (${investment.targetWing}) has insufficient available shares (${targetAvailable.toFixed(2)}%)` 
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
