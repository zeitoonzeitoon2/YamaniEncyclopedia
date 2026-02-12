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

    return NextResponse.json({ activeRound })
  } catch (error) {
    console.error('Error fetching active round:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'EXPERT')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { domainId, wing } = body

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
        startDate,
        endDate,
        status: 'ACTIVE'
      }
    })

    return NextResponse.json({ success: true, round: newRound })
  } catch (error) {
    console.error('Error starting election round:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'EXPERT')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { roundId } = body

    if (!roundId) {
      return NextResponse.json({ error: 'roundId is required' }, { status: 400 })
    }

    const round = await prisma.electionRound.findUnique({
      where: { id: roundId },
      include: {
        candidacies: {
          where: { status: 'PENDING' },
          orderBy: { totalScore: 'desc' },
          take: 10
        }
      }
    })

    if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
    if (round.status !== 'ACTIVE') return NextResponse.json({ error: 'Round is already completed' }, { status: 400 })

    // Finalize the round
    await prisma.$transaction(async (tx) => {
      // 1. Mark round as completed
      await tx.electionRound.update({
        where: { id: roundId },
        data: { status: 'COMPLETED' }
      })

      // 2. Clear existing experts for this wing in this domain
      // User said "ده نفری که بیشترین امتیاز رو کسب کردن به عنوان اعضای اون تیم تعیین میشن"
      // This implies replacing or refreshing the team.
      await tx.domainExpert.deleteMany({
        where: { domainId: round.domainId, wing: round.wing }
      })

      // 3. Approve top 10 candidates and add them as experts
      for (const candidacy of round.candidacies) {
        await tx.domainExpert.create({
          data: {
            userId: candidacy.candidateUserId,
            domainId: round.domainId,
            role: candidacy.role,
            wing: round.wing
          }
        })

        await tx.expertCandidacy.update({
          where: { id: candidacy.id },
          data: { status: 'APPROVED' }
        })
      }

      // 4. Reject other pending candidacies in this round
      await tx.expertCandidacy.updateMany({
        where: { roundId, status: 'PENDING' },
        data: { status: 'REJECTED' }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error finalizing election round:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
