import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const me = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!me || !['EXPERT','ADMIN'].includes(me.role)) {
      return NextResponse.json({ error: 'Only experts can vote' }, { status: 403 })
    }

    const body = await request.json()
    const pollId = String(body?.pollId || '')
    const optionId = String(body?.optionId || '')
    if (!pollId || !optionId) return NextResponse.json({ error: 'pollId and optionId are required' }, { status: 400 })

    const option = await prisma.commentPollOption.findUnique({ where: { id: optionId }, select: { id: true, pollId: true } })
    if (!option || option.pollId !== pollId) return NextResponse.json({ error: 'Invalid option' }, { status: 400 })

    // Upsert vote: one per poll per voter
    const vote = await prisma.commentPollVote.upsert({
      where: { pollId_voterId: { pollId, voterId: me.id } },
      update: { optionId },
      create: { pollId, optionId, voterId: me.id },
      select: { id: true }
    })

    // Return updated counts with weights
    const poll = await prisma.commentPoll.findUnique({
      where: { id: pollId },
      include: {
        comment: {
          select: {
            postId: true,
            post: { select: { domainId: true } },
            chapterId: true,
            chapter: { select: { course: { select: { domainId: true } } } }
          }
        }
      }
    })

    const domainId = poll?.comment?.post?.domainId || poll?.comment?.chapter?.course?.domainId

    const votes = await prisma.commentPollVote.findMany({ 
      where: { pollId }, 
      select: { optionId: true, voterId: true } 
    })
    
    const options = await prisma.commentPollOption.findMany({ where: { pollId }, select: { id: true, text: true } })
    
    let voterRoles: Record<string, string> = {}
    
    if (domainId) {
       const voterIds = votes.map(v => v.voterId)
       const experts = await prisma.domainExpert.findMany({
         where: { domainId, userId: { in: voterIds } },
         select: { userId: true, role: true }
       })
       for (const e of experts) {
         voterRoles[e.userId] = e.role
       }
    }

    const counts: Record<string, number> = {}
    for (const v of votes) {
       let weight = 1
       if (domainId) {
         // Apply weight only if domain context exists
         const role = voterRoles[v.voterId]
         if (role === 'HEAD') weight = 2
       }
       counts[v.optionId] = (counts[v.optionId] || 0) + weight
    }

    return NextResponse.json({ ok: true, options: options.map(o => ({ id: o.id, text: o.text, count: counts[o.id] || 0 })) })
  } catch (error) {
    console.error('Error voting on comment poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}