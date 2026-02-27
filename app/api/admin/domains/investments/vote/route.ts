import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkScoreApproval, getAvailableVotingPower } from '@/lib/voting-utils'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { investmentId, score } = await req.json()

    if (!investmentId || typeof score !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
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

    for (const dId of affectedDomains) {
      await prisma.domainInvestmentVote.upsert({
        where: {
          investmentId_voterId_domainId: {
            investmentId,
            voterId: session.user.id,
            domainId: dId
          }
        },
        update: { score },
        create: {
          investmentId,
          voterId: session.user.id,
          domainId: dId,
          score
        }
      })
    }

    const proposerVotes = await prisma.domainInvestmentVote.findMany({
      where: { investmentId, domainId: investment.proposerDomainId }
    })
    const targetVotes = await prisma.domainInvestmentVote.findMany({
      where: { investmentId, domainId: investment.targetDomainId }
    })

    const proposerResult = await checkScoreApproval(
      investment.proposerDomainId,
      proposerVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )
    const targetResult = await checkScoreApproval(
      investment.targetDomainId,
      targetVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    if (proposerResult.rejected || targetResult.rejected) {
      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED', proposerResult, targetResult })
    }

    if (proposerResult.approved && targetResult.approved) {
      const proposerAvailable = await getAvailableVotingPower(
        investment.proposerDomainId, 
        investment.proposerWing
      )
      
      if (proposerAvailable < investment.percentageInvested) {
        return NextResponse.json({ 
          error: `Activation failed: Proposer wing (${investment.proposerWing}) has insufficient available shares (${proposerAvailable.toFixed(2)}%)` 
        }, { status: 409 })
      }

      const targetAvailable = await getAvailableVotingPower(
        investment.targetDomainId, 
        investment.targetWing
      )

      if (targetAvailable < investment.percentageReturn) {
        return NextResponse.json({ 
          error: `Activation failed: Target wing (${investment.targetWing}) has insufficient available shares (${targetAvailable.toFixed(2)}%)` 
        }, { status: 409 })
      }

      const startDate = new Date()
      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { status: 'ACTIVE', startDate }
      })
      return NextResponse.json({ status: 'ACTIVE', proposerResult, targetResult })
    }

    return NextResponse.json({ status: 'PENDING', proposerResult, targetResult })
  } catch (error) {
    console.error('Error voting on investment:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
