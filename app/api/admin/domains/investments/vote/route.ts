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

    // Check strict membership (Wing-specific)
    // Even ADMINS are restricted to their actual domain/wing membership for voting.
    const proposerStrict = await prisma.domainExpert.findFirst({
        where: { userId: session.user.id, domainId: investment.proposerDomainId, wing: investment.proposerWing }
    })
    
    const targetStrict = await prisma.domainExpert.findFirst({
        where: { userId: session.user.id, domainId: investment.targetDomainId, wing: investment.targetWing }
    })

    const affectedDomains = []
    if (proposerStrict) affectedDomains.push(investment.proposerDomainId)
    if (targetStrict) affectedDomains.push(investment.targetDomainId)
    
    if (affectedDomains.length === 0) {
        // If user has no valid membership in the affected wings, they cannot vote.
        // This applies to everyone, including Global Admins.
        return NextResponse.json({ error: 'You are not an expert in the affected wing of the domain' }, { status: 403 })
    }

    // Record votes
    for (const dId of affectedDomains) {
      // Determine which wing we are voting for in this domain
      // ... logic handled by upsert using investmentId + domainId

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
      
      const votes = await prisma.domainInvestmentVote.findMany({
        where: { investmentId, domainId }
      })
      
      const expertIds = new Set(experts.map(e => e.userId))
      
      let approvedPoints = 0
      let rejectedPoints = 0
      let totalPoints = experts.length

      // If no experts exist, and user is admin, their vote should count as 1/1
      // But only if they actually voted
      if (experts.length === 0) {
        const adminVotes = votes.filter(v => v.voterId === session.user.id) // Assuming current user is the admin
        if (adminVotes.length > 0) {
           totalPoints = 1
           if (adminVotes[0].vote === 'APPROVE') approvedPoints = 1
           if (adminVotes[0].vote === 'REJECT') rejectedPoints = 1
        }
        return { totalPoints, approvedPoints, rejectedPoints }
      }
      
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
      // We do NOT overwrite endDate here. We respect the endDate set during proposal creation.
      // const endDate = new Date()
      // endDate.setFullYear(startDate.getFullYear() + investment.durationYears)

      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { 
          status: 'ACTIVE',
          startDate,
          // endDate // Removed to keep original endDate
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
