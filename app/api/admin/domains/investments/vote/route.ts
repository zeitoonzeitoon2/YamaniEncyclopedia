import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateVotingResult, getAvailableVotingPower } from '@/lib/voting-utils'

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

    const proposerMember = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: investment.proposerDomainId }
    })
    const targetMember = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: investment.targetDomainId }
    })

    const affectedDomains = []
    if (proposerMember) affectedDomains.push(investment.proposerDomainId)
    if (targetMember) affectedDomains.push(investment.targetDomainId)

    if (affectedDomains.length === 0) {
      return NextResponse.json({ error: 'Only affected domain experts can vote' }, { status: 403 })
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

    const proposerVotes = await prisma.domainInvestmentVote.findMany({
      where: { investmentId, domainId: investment.proposerDomainId }
    })
    const targetVotes = await prisma.domainInvestmentVote.findMany({
      where: { investmentId, domainId: investment.targetDomainId }
    })

    const proposerResult = await calculateVotingResult(
      proposerVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' })),
      investment.proposerDomainId,
      'DIRECT'
    )
    const targetResult = await calculateVotingResult(
      targetVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' })),
      investment.targetDomainId,
      'DIRECT'
    )

    if (proposerResult.rejections > 50 || targetResult.rejections > 50) {
      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED' })
    }

    if (proposerResult.approvals > 50 && targetResult.approvals > 50) {
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
