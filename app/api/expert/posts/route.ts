import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'
import { Prisma } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    const email = (token as any)?.email || session?.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const expertDomains = await prisma.domainExpert.findMany({
      where: { userId: user.id },
      select: { domainId: true },
    })
    const expertDomainIds = expertDomains.map((d) => d.domainId)
    const isExpert = user.role === 'EXPERT' || user.role === 'ADMIN'
    const isDomainExpert = expertDomainIds.length > 0

    const url = new URL(request.url)
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '20', 10)
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = Number.isNaN(pageSizeParam) ? 20 : Math.min(Math.max(pageSizeParam, 1), 50)
    const authorQueryRaw = url.searchParams.get('authorQuery')
    const authorQuery = authorQueryRaw ? authorQueryRaw.trim() : ''

    const baseWhere: Prisma.PostWhereInput = isExpert || !isDomainExpert
      ? { NOT: { status: { in: ['DRAFT'] } } }
      : {
          AND: [
            { NOT: { status: { in: ['DRAFT'] } } },
            { status: 'PENDING' },
            {
              OR: [
                { domainId: { in: expertDomainIds } },
                { relatedDomainIds: { hasSome: expertDomainIds } },
              ],
            },
          ],
        }
    const whereClause: Prisma.PostWhereInput = authorQuery
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { author: { is: { name: { contains: authorQuery, mode: 'insensitive' as const } } } },
                { author: { is: { email: { contains: authorQuery, mode: 'insensitive' as const } } } },
              ],
            },
          ],
        }
      : baseWhere

    const totalCount = await prisma.post.count({ where: whereClause })

    const posts = await prisma.post.findMany({
      where: whereClause,
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        changeReason: true,
        changeSummary: true,
        author: {
          select: { id: true, name: true, email: true, image: true, role: true },
        },
        originalPost: {
          select: { id: true, type: true, version: true },
        },
        votes: {
          select: { id: true, score: true, adminId: true, admin: { select: { name: true, role: true } } },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    const postIds = posts.map(p => p.id)

    const reads = postIds.length ? await prisma.commentRead.findMany({
      where: { userId: user.id, postId: { in: postIds } },
      select: { postId: true, lastReadAt: true },
    }) : []
    const readMap = new Map<string, Date>()
    for (const r of reads) readMap.set(r.postId, r.lastReadAt)

    const unreadCounts: Record<string, number> = {}
    for (const postId of postIds) {
      const lastReadAt = readMap.get(postId)
      const count = await prisma.comment.count({
        where: {
          postId,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          NOT: { authorId: user.id },
        },
      })
      unreadCounts[postId] = count
    }

    const commentsAgg = postIds.length > 0 ? await prisma.comment.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds } },
      _max: { createdAt: true },
      _count: { _all: true },
    }) : []

    const commentsMap = new Map<string, { latestCommentAt: Date | null; commentsCount: number }>()
    for (const row of commentsAgg) {
      if (row.postId) {
        commentsMap.set(row.postId, {
          latestCommentAt: row._max.createdAt ?? null,
          commentsCount: row._count._all ?? 0,
        })
      }
    }

    const items = posts.map(post => {
      const totalScore = post.votes ? post.votes.reduce((sum, vote) => sum + vote.score, 0) : 0
      const cm = commentsMap.get(post.id)
      return {
        ...post,
        totalScore,
        latestCommentAt: cm?.latestCommentAt || null,
        commentsCount: cm?.commentsCount ?? (post._count?.comments ?? 0),
        unreadComments: unreadCounts[post.id] || 0,
      }
    })

    return NextResponse.json({
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      hasNext: page * pageSize < totalCount,
    })
  } catch (error) {
    console.error('Error fetching expert posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
