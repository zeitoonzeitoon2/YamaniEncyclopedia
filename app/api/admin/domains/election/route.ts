import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domainId = searchParams.get('domainId')
    const wing = searchParams.get('wing')

    if (!domainId || !wing) {
      return NextResponse.json({ error: 'domainId and wing are required' }, { status: 400 })
    }

    const activeRound = await prisma.electionRound.findFirst({
      where: {
        domainId,
        wing,
        status: 'ACTIVE'
      },
      orderBy: { startDate: 'desc' }
    })

    if (activeRound && new Date(activeRound.endDate) < new Date()) {
      // Lazy Finalize
      await finalizeRound(activeRound.id)
      return NextResponse.json({ activeRound: null })
    }

    return NextResponse.json({ activeRound })
  } catch (error: any) {
    console.error('Error fetching active round:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

async function finalizeRound(roundId: string) {
  const round = await prisma.electionRound.findUnique({
    where: { id: roundId },
    include: {
      candidacies: {
        where: { status: 'PENDING' },
        orderBy: { totalScore: 'desc' },
        // No take limit here, we handle slicing in logic
      }
    }
  })

  if (!round || round.status !== 'ACTIVE') return

  await prisma.$transaction(async (tx) => {
    await tx.electionRound.update({
      where: { id: roundId },
      data: { status: 'COMPLETED' }
    })

    if (round.type === 'MEMBERS') {
      // 1. Clear existing experts/heads for this wing
      await tx.domainExpert.deleteMany({
        where: { domainId: round.domainId, wing: round.wing }
      })

      // 2. Promote top 10 candidates to EXPERT
      const winners = round.candidacies.slice(0, 10)
      for (const candidacy of winners) {
        await tx.domainExpert.create({
          data: {
            userId: candidacy.candidateUserId,
            domainId: round.domainId,
            role: 'EXPERT',
            wing: round.wing
          }
        })

        await tx.expertCandidacy.update({
          where: { id: candidacy.id },
          data: { status: 'APPROVED' }
        })
      }

      const losers = round.candidacies.slice(10)
      for (const cand of losers) {
        await tx.expertCandidacy.update({
          where: { id: cand.id },
          data: { status: 'REJECTED' }
        })
      }

      // 3. Start HEAD election automatically
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(startDate.getDate() + 3) // 3 days for head election

      await tx.electionRound.create({
        data: {
          domainId: round.domainId,
          wing: round.wing,
          type: 'HEAD',
          startDate,
          endDate,
          status: 'ACTIVE'
        }
      })

    } else if (round.type === 'HEAD') {
      // 1. Pick top 1 candidate
      const winner = round.candidacies[0]
      if (winner) {
        // Update existing expert role to HEAD
        const existingExpert = await tx.domainExpert.findFirst({
          where: { userId: winner.candidateUserId, domainId: round.domainId }
        })

        if (existingExpert) {
          await tx.domainExpert.update({
            where: { id: existingExpert.id },
            data: { role: 'HEAD' }
          })
        } else {
          // If not an expert (should not happen if restrictions enforced), create as HEAD
          await tx.domainExpert.create({
            data: {
              userId: winner.candidateUserId,
              domainId: round.domainId,
              role: 'HEAD',
              wing: round.wing
            }
          })
        }

        await tx.expertCandidacy.update({
          where: { id: winner.id },
          data: { status: 'APPROVED' }
        })
      }

      const losers = round.candidacies.slice(1)
      for (const cand of losers) {
        await tx.expertCandidacy.update({
          where: { id: cand.id },
          data: { status: 'REJECTED' }
        })
      }
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'EXPERT')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { domainId, wing, type } = body

    if (!domainId || !wing) {
      return NextResponse.json({ error: 'domainId and wing are required' }, { status: 400 })
    }

    // Check if there is already an active round
    const existingActive = await prisma.electionRound.findFirst({
      where: { domainId, wing, status: 'ACTIVE' }
    })

    if (existingActive) {
      return NextResponse.json({ error: 'An active election round already exists' }, { status: 400 })
    }

    // Start a new round: 1 week from now
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + 7)

    const newRound = await prisma.electionRound.create({
      data: {
        domainId,
        wing,
        type: type || 'MEMBERS',
        startDate,
        endDate,
        status: 'ACTIVE'
      }
    })

    return NextResponse.json({ success: true, round: newRound })
  } catch (error: any) {
    console.error('Error starting election round:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'EXPERT')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roundId, action } = body

    if (!roundId) {
      return NextResponse.json({ error: 'roundId is required' }, { status: 400 })
    }

    if (action === 'EXTEND') {
      const round = await prisma.electionRound.findUnique({ where: { id: roundId } })
      if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

      // Check if Admin or Parent Domain Expert
      let canExtend = session.user.role === 'ADMIN'
      if (!canExtend) {
        const domain = await prisma.domain.findUnique({
          where: { id: round.domainId },
          select: { parentId: true }
        })
        if (domain?.parentId) {
          const parentExpert = await prisma.domainExpert.findFirst({
            where: { domainId: domain.parentId, userId: session.user.id }
          })
          // Only HEAD can extend
          if (parentExpert && parentExpert.role === 'HEAD') canExtend = true
        }
      }

      if (!canExtend) {
        return NextResponse.json({ error: 'Only global admins or domain heads can extend' }, { status: 403 })
      }

      const newEndDate = new Date(round.endDate)
      newEndDate.setDate(newEndDate.getDate() + 1)

      await prisma.electionRound.update({
        where: { id: roundId },
        data: { endDate: newEndDate }
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'FINALIZE') {
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only global admins can force end elections' }, { status: 403 })
      }
      await finalizeRound(roundId)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error updating election round:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
