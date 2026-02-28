import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type NotificationItem = {
  type: string
  id: string
  title: string
  domainName?: string
  createdAt: string
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ total: 0, items: [] })
    }

    const userId = session.user.id

    const expertDomains = await prisma.domainExpert.findMany({
      where: { userId },
      select: { domainId: true, domain: { select: { name: true } } },
    })

    if (expertDomains.length === 0) {
      return NextResponse.json({ total: 0, items: [] })
    }

    const domainIds = expertDomains.map(e => e.domainId)
    const domainNameMap = Object.fromEntries(expertDomains.map(e => [e.domainId, e.domain.name]))

    const items: NotificationItem[] = []

    const [courses, chapters, prerequisites, domainPrereqs, proposals, investments, questions, posts] =
      await Promise.all([
        prisma.course.findMany({
          where: {
            status: 'PENDING',
            domainId: { in: domainIds },
            votes: { none: { voterId: userId } },
          },
          select: { id: true, title: true, domainId: true, createdAt: true },
        }),

        prisma.courseChapter.findMany({
          where: {
            status: 'PENDING',
            submittedForVote: true,
            course: { domainId: { in: domainIds } },
            votes: { none: { voterId: userId } },
          },
          select: { id: true, title: true, createdAt: true, course: { select: { domainId: true, title: true } } },
        }),

        prisma.coursePrerequisite.findMany({
          where: {
            status: 'PENDING',
            course: { domainId: { in: domainIds } },
            votes: { none: { voterId: userId } },
          },
          select: {
            id: true, createdAt: true,
            course: { select: { title: true, domainId: true } },
            prerequisiteCourse: { select: { title: true } },
          },
        }),

        prisma.domainPrerequisite.findMany({
          where: {
            status: 'PENDING',
            domainId: { in: domainIds },
            votes: { none: { voterId: userId } },
          },
          select: {
            id: true, createdAt: true, domainId: true,
            course: { select: { title: true } },
          },
        }),

        prisma.domainProposal.findMany({
          where: {
            status: 'PENDING',
            votes: { none: { voterId: userId } },
            OR: [
              { parentId: { in: domainIds } },
              { targetDomainId: { in: domainIds } },
            ],
          },
          select: { id: true, type: true, name: true, createdAt: true, parentId: true, targetDomainId: true },
        }),

        prisma.domainInvestment.findMany({
          where: {
            status: 'PENDING',
            votes: { none: { voterId: userId } },
            OR: [
              { proposerDomainId: { in: domainIds } },
              { targetDomainId: { in: domainIds } },
            ],
          },
          select: { id: true, createdAt: true, proposerDomainId: true, targetDomainId: true },
        }),

        prisma.chapterQuestion.findMany({
          where: {
            status: 'PENDING',
            chapter: { course: { domainId: { in: domainIds } } },
            votes: { none: { voterId: userId } },
          },
          select: { id: true, question: true, createdAt: true, chapter: { select: { course: { select: { domainId: true } } } } },
        }),

        prisma.post.findMany({
          where: {
            status: 'PENDING',
            votes: { none: { adminId: userId } },
            OR: [
              { domainId: { in: domainIds } },
              { relatedDomainIds: { hasSome: domainIds } },
            ],
          },
          select: { id: true, content: true, domainId: true, createdAt: true, type: true },
        }),
      ])

    for (const c of courses) {
      items.push({ type: 'course', id: c.id, title: c.title, domainName: domainNameMap[c.domainId], createdAt: c.createdAt.toISOString() })
    }
    for (const ch of chapters) {
      items.push({ type: 'chapter', id: ch.id, title: ch.title, domainName: domainNameMap[ch.course.domainId], createdAt: ch.createdAt.toISOString() })
    }
    for (const p of prerequisites) {
      items.push({ type: 'prerequisite', id: p.id, title: `${p.prerequisiteCourse.title} → ${p.course.title}`, domainName: domainNameMap[p.course.domainId], createdAt: p.createdAt.toISOString() })
    }
    for (const d of domainPrereqs) {
      items.push({ type: 'domainPrerequisite', id: d.id, title: d.course.title, domainName: domainNameMap[d.domainId], createdAt: d.createdAt.toISOString() })
    }
    for (const pr of proposals) {
      const dId = pr.parentId || pr.targetDomainId
      items.push({ type: 'proposal', id: pr.id, title: pr.name || pr.type, domainName: dId ? domainNameMap[dId] : undefined, createdAt: pr.createdAt.toISOString() })
    }
    for (const inv of investments) {
      const pName = domainNameMap[inv.proposerDomainId]
      const tName = domainNameMap[inv.targetDomainId]
      items.push({ type: 'investment', id: inv.id, title: `${pName || '?'} → ${tName || '?'}`, createdAt: inv.createdAt.toISOString() })
    }
    for (const q of questions) {
      items.push({ type: 'question', id: q.id, title: q.question.slice(0, 60), domainName: domainNameMap[q.chapter.course.domainId], createdAt: q.createdAt.toISOString() })
    }
    for (const p of posts) {
      const snippet = p.content.replace(/<[^>]*>/g, '').slice(0, 50)
      items.push({ type: 'post', id: p.id, title: snippet || p.type, domainName: p.domainId ? domainNameMap[p.domainId] : undefined, createdAt: p.createdAt.toISOString() })
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ total: items.length, items: items.slice(0, 50) })
  } catch (error) {
    console.error('GET /api/notifications error:', error)
    return NextResponse.json({ total: 0, items: [] })
  }
}
