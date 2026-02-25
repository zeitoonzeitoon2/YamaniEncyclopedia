import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateVotingResult, getInternalVotingMetrics, settleExpiredInvestments } from '@/lib/voting-utils'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { proposerDomainId, targetDomainId, percentageInvested, percentageReturn, endDate, proposerWing = 'RIGHT', targetWing = 'RIGHT', investedDomainId } = await req.json()

    if (!proposerDomainId || !targetDomainId || percentageInvested === undefined || percentageReturn === undefined || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (proposerDomainId === targetDomainId) {
      return NextResponse.json({ error: 'Cannot invest in the same domain' }, { status: 400 })
    }

    // Restriction: Only Direct Parent and Direct Child can invest in each other
    const proposer = await prisma.domain.findUnique({ where: { id: proposerDomainId }, select: { parentId: true } })
    const target = await prisma.domain.findUnique({ where: { id: targetDomainId }, select: { parentId: true } })

    const isParentChild = proposer?.parentId === targetDomainId || target?.parentId === proposerDomainId
    if (!isParentChild) {
      return NextResponse.json({ error: 'Investments are only allowed between direct parent and child domains' }, { status: 403 })
    }

    // Check if proposer is an expert in the proposer domain OR the target domain
    const membership = await prisma.domainExpert.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ['HEAD', 'EXPERT'] },
        OR: [
          {
            domainId: proposerDomainId,
            wing: proposerWing
          },
          {
            domainId: targetDomainId,
            wing: targetWing
          }
        ]
      }
    })

    if (!membership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: `You must be an expert in the ${proposerWing} wing of the proposer domain OR the ${targetWing} wing of the target domain` }, { status: 403 })
    }

    // Identify the currency domain (whose shares are being moved)
    // If investedDomainId is not provided, it defaults to the proposer's own shares
    const currencyDomainId = investedDomainId || proposerDomainId

    // 1. Calculate Initial Base Balance (from Permanent Shares)
    // Only applies if we are investing our OWN shares
    let currentBalance = 0
    if (currencyDomainId === proposerDomainId) {
      const proposerOwnShare = await prisma.domainVotingShare.findFirst({
        where: {
          domainId: proposerDomainId,
          domainWing: proposerWing,
          ownerDomainId: proposerDomainId,
          ownerWing: proposerWing
        }
      })
      currentBalance = proposerOwnShare ? proposerOwnShare.percentage : (proposerWing === 'RIGHT' ? 100 : 0)
    }

    // 2. Fetch Active Investments affecting the balance
    // Incoming: Proposer RECEIVED currency shares (Target=Proposer, TargetWing=SpendingWing, Invested=Currency)
    const incoming = await prisma.domainInvestment.findMany({
      where: {
        targetDomainId: proposerDomainId,
        targetWing: proposerWing,
        status: 'ACTIVE',
        OR: [
          { investedDomainId: currencyDomainId },
          { investedDomainId: null, proposerDomainId: currencyDomainId }
        ]
      }
    })

    // Outgoing: Proposer GAVE currency shares (Proposer=Proposer, ProposerWing=SpendingWing, Invested=Currency)
    const outgoing = await prisma.domainInvestment.findMany({
      where: {
        proposerDomainId: proposerDomainId,
        proposerWing: proposerWing,
        status: 'ACTIVE',
        OR: [
          { investedDomainId: currencyDomainId },
          { investedDomainId: null, proposerDomainId: currencyDomainId }
        ]
      }
    })

    // Dividend Obligations: Proposer OWES currency shares as return (Target=Proposer, TargetWing=SpendingWing)
    // This only applies if currency is Proposer's own shares (since dividends are paid in own shares)
    let dividendObligations: any[] = []
    if (currencyDomainId === proposerDomainId) {
      dividendObligations = await prisma.domainInvestment.findMany({
        where: {
          targetDomainId: proposerDomainId,
          targetWing: proposerWing,
          percentageReturn: { gt: 0 },
          status: 'ACTIVE'
        }
      })
    }

    // 3. Construct Timeline Events
    // We only care about events in [Now, NewInvestmentEndDate]
    // And specifically events that REDUCE balance (Expiry of Incoming, Due Date of Dividend).
    // Events that INCREASE balance (Expiry of Outgoing) are also relevant as they replenish funds.
    
    interface TimelineEvent {
      date: Date
      change: number
      type: string
    }

    const events: TimelineEvent[] = []
    const newInvestmentEnd = new Date(endDate)

    // Add Incoming (Positive Balance now, Negative at End)
    incoming.forEach(inv => {
      currentBalance += inv.percentageInvested
      if (inv.endDate && inv.endDate <= newInvestmentEnd) {
        events.push({ date: inv.endDate, change: -inv.percentageInvested, type: 'incoming_expiry' })
      }
    })

    // Add Outgoing (Negative Balance now, Positive at End)
    outgoing.forEach(inv => {
      currentBalance -= inv.percentageInvested
      if (inv.endDate && inv.endDate <= newInvestmentEnd) {
        events.push({ date: inv.endDate, change: inv.percentageInvested, type: 'outgoing_expiry' })
      }
    })

    // Add Dividends (Future Negative)
    dividendObligations.forEach(inv => {
      // Obligation is due at endDate
      if (inv.endDate && inv.endDate <= newInvestmentEnd) {
        events.push({ date: inv.endDate, change: -inv.percentageReturn, type: 'dividend_due' })
      }
    })

    // Check Initial Balance (Current Status)
    if (currentBalance < percentageInvested) {
      return NextResponse.json({ 
        error: `Insufficient current balance. Have ${currentBalance.toFixed(2)}%, need ${percentageInvested}%` 
      }, { status: 400 })
    }

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime())

    // Simulate Timeline
    let simulatedBalance = currentBalance - percentageInvested // Immediate deduction for new investment
    
    for (const event of events) {
      simulatedBalance += event.change
      // Allow small floating point error margin? 
      // JavaScript float precision issues might cause 0 to be -0.00000001.
      if (simulatedBalance < -0.00001) {
         return NextResponse.json({ 
           error: `Insufficient balance at ${event.date.toISOString().split('T')[0]}. Balance drops to ${simulatedBalance.toFixed(2)}% due to ${event.type}.` 
         }, { status: 400 })
      }
    }

    // Create the investment proposal
    const investment = await prisma.domainInvestment.create({
      data: {
        proposerDomainId,
        targetDomainId,
        investedDomainId: currencyDomainId === proposerDomainId ? null : currencyDomainId, // Store explicit ID only if not own
        percentageInvested,
        percentageReturn,
        proposerWing,
        targetWing,
        endDate: new Date(endDate),
        status: 'PENDING'
      }
    })

    return NextResponse.json({ investment })
  } catch (error) {
    console.error('Error creating investment proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // Auto-settle expired investments whenever the list is fetched
    await settleExpiredInvestments()

    const { searchParams } = new URL(req.url)
    const domainId = searchParams.get('domainId')
    const statusParam = searchParams.get('status')

    const where: any = {}
    if (domainId) {
      where.OR = [{ proposerDomainId: domainId }, { targetDomainId: domainId }]
    }
    
    if (statusParam) {
      where.status = { in: statusParam.split(',') }
    }

    const investments = await prisma.domainInvestment.findMany({
      where,
      include: {
        proposerDomain: { select: { id: true, name: true, slug: true } },
        targetDomain: { select: { id: true, name: true, slug: true } },
        votes: {
          include: {
            voter: {
              select: {
                role: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const enrichedInvestments = await Promise.all(investments.map(async (inv) => {
      const proposerVotes = inv.votes.filter(v => v.domainId === inv.proposerDomainId)
      const targetVotes = inv.votes.filter(v => v.domainId === inv.targetDomainId)

      const proposerMapped = proposerVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' }))
      const targetMapped = targetVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' }))

      const proposerMetrics = await getInternalVotingMetrics(inv.proposerDomainId, proposerMapped)
      const targetMetrics = await getInternalVotingMetrics(inv.targetDomainId, targetMapped)
      const proposerResult = await calculateVotingResult(proposerMapped, inv.proposerDomainId, 'DIRECT')
      const targetResult = await calculateVotingResult(targetMapped, inv.targetDomainId, 'DIRECT')

      return {
        ...inv,
        stats: {
          proposer: {
            ...proposerMetrics,
            approvals: proposerResult.approvals,
            rejections: proposerResult.rejections
          },
          target: {
            ...targetMetrics,
            approvals: targetResult.approvals,
            rejections: targetResult.rejections
          }
        }
      }
    }))

    return NextResponse.json({ investments: enrichedInvestments })
  } catch (error) {
    console.error('Error fetching investments:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
