import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const posts = await prisma.post.findMany({
      select: {
        id: true,
        content: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        originalPost: {
          select: {
            id: true,
            content: true,
            type: true,
            version: true,
          },
        },
        votes: {
          select: {
            id: true,
            score: true,
            adminId: true,
            admin: {
              select: { name: true }
            }
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // حساب مجموع النقاط لكل منشور
    const postsWithScores = posts.map(post => {
      const totalScore = post.votes ? post.votes.reduce((sum, vote) => sum + vote.score, 0) : 0
      return {
        ...post,
        totalScore
      }
    })

    return NextResponse.json(postsWithScores)
  } catch (error) {
    console.error('Error fetching admin posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}