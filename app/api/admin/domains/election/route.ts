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
        status: { in: ['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'] }
      },
      orderBy: { startDate: 'desc' }
    })

    if (activeRound) {
      // Check for expiration
      if (new Date(activeRound.endDate) < new Date()) {
        // Lazy Finalize
        await finalizeRound(activeRound.id)
        // Check if a new round was started (e.g. HEAD round after MEMBERS)
        const nextRound = await prisma.electionRound.findFirst({
          where: {
            domainId,
            wing,
            status: { in: ['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'] }
          },
          orderBy: { startDate: 'desc' }
        })
        return NextResponse.json({ activeRound: nextRound || null })
      }
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

  if (!round || !['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'].includes(round.status)) return

  // Determine type from status
  const isMembersElection = round.status === 'ACTIVE' || round.status === 'MEMBERS_ACTIVE'
  const isHeadElection = round.status === 'HEAD_ACTIVE'

  await prisma.$transaction(async (tx) => {
    // Mark current round as completed
    const completedStatus = isMembersElection ? 'MEMBERS_COMPLETED' : 'HEAD_COMPLETED'
    
    await tx.electionRound.update({
      where: { id: roundId },
      data: { status: completedStatus }
    })

    if (isMembersElection) {
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
      endDate.setDate(startDate.getDate() + 2) // 2 days for head election

      const headRound = await tx.electionRound.create({
        data: {
          domainId: round.domainId,
          wing: round.wing,
          startDate,
          endDate,
          status: 'HEAD_ACTIVE'
        }
      })

      // 4. Automatically nominate all new experts for HEAD position
      for (const candidacy of winners) {
        // Clear previous votes for the new round
        await tx.candidacyVote.deleteMany({
          where: { candidacyId: candidacy.id }
        })

        // Use upsert to avoid Unique constraint violation
        await tx.expertCandidacy.upsert({
          where: {
            domainId_candidateUserId: {
              domainId: round.domainId,
              candidateUserId: candidacy.candidateUserId
            }
          },
          update: {
            proposerUserId: candidacy.candidateUserId,
            role: 'HEAD',
            wing: round.wing,
            status: 'PENDING',
            roundId: headRound.id,
            totalScore: 0
          },
          create: {
            domainId: round.domainId,
            candidateUserId: candidacy.candidateUserId,
            proposerUserId: candidacy.candidateUserId, // Self-nominated automatically
            role: 'HEAD',
            wing: round.wing,
            status: 'PENDING',
            roundId: headRound.id,
            totalScore: 0
          }
        })
      }

    } else if (isHeadElection) {
      // 1. Pick top 1 candidate
      const winner = round.candidacies[0]
      if (winner) {
        // Update existing expert role to HEAD
        // Note: The candidate should already be an EXPERT from the previous round or existing role
        const existingExpert = await tx.domainExpert.findFirst({
          where: { userId: winner.candidateUserId, domainId: round.domainId }
        })

        if (existingExpert) {
          await tx.domainExpert.update({
            where: { id: existingExpert.id },
            data: { role: 'HEAD' }
          })
        } else {
          // Fallback if not found (e.g. they were expert but got deleted? unlikely)
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

      // 2. Schedule next MEMBERS election in 2 months
      const nextMembersStartDate = new Date()
      nextMembersStartDate.setMonth(nextMembersStartDate.getMonth() + 2) // Start 2 months from now
      
      const nextMembersEndDate = new Date(nextMembersStartDate)
      nextMembersEndDate.setDate(nextMembersStartDate.getDate() + 7) // Lasts for 1 week

      await tx.electionRound.create({
        data: {
          domainId: round.domainId,
          wing: round.wing,
          startDate: nextMembersStartDate,
          endDate: nextMembersEndDate,
          status: 'MEMBERS_ACTIVE' // It will be "active" but in the future, effectively "scheduled"
        }
      })
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
      where: { 
        domainId, 
        wing, 
        status: { in: ['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'] } 
      }
    })

    if (existingActive) {
      return NextResponse.json({ error: 'An active election round already exists' }, { status: 400 })
    }

    // Start a new round: 1 week from now
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + 7)

    // Determine initial status based on requested type
    // If user explicitly asks for HEAD, we start HEAD_ACTIVE. Default is MEMBERS_ACTIVE.
    const initialStatus = type === 'HEAD' ? 'HEAD_ACTIVE' : 'MEMBERS_ACTIVE'

    const newRound = await prisma.electionRound.create({
      data: {
        domainId,
        wing,
        startDate,
        endDate,
        status: initialStatus
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
