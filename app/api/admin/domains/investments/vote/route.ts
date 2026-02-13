import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

    // Check if voter is expert in proposer or target domain
    const proposerMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: investment.proposerDomainId }
    })

    const targetMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: investment.targetDomainId }
    })

    if (!proposerMembership && !targetMembership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'You are not an expert in either affected domain' }, { status: 403 })
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
    const proposerExpertsCount = await prisma.domainExpert.count({ where: { domainId: investment.proposerDomainId } })
    const targetExpertsCount = await prisma.domainExpert.count({ where: { domainId: investment.targetDomainId } })

    const proposerApproveVotes = await prisma.domainInvestmentVote.count({
      where: { investmentId, domainId: investment.proposerDomainId, vote: 'APPROVE' }
    })
    const targetApproveVotes = await prisma.domainInvestmentVote.count({
      where: { investmentId, domainId: investment.targetDomainId, vote: 'APPROVE' }
    })

    const proposerRejected = await prisma.domainInvestmentVote.count({
      where: { investmentId, domainId: investment.proposerDomainId, vote: 'REJECT' }
    })
    const targetRejected = await prisma.domainInvestmentVote.count({
      where: { investmentId, domainId: investment.targetDomainId, vote: 'REJECT' }
    })

    const proposerThreshold = Math.max(1, Math.floor(proposerExpertsCount / 2) + 1)
    const targetThreshold = Math.max(1, Math.floor(targetExpertsCount / 2) + 1)

    if (proposerRejected >= proposerThreshold || targetRejected >= targetThreshold) {
      await prisma.domainInvestment.update({
        where: { id: investmentId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED' })
    }

    if (proposerApproveVotes >= proposerThreshold && targetApproveVotes >= targetThreshold) {
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
