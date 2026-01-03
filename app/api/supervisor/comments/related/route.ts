import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    const email = (token as any)?.email || session?.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const me = await prisma.user.findUnique({ where: { email } })
    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Allow all logged-in users to see comments related to them

    const relatedComments = await prisma.comment.findMany({
      where: {
        OR: [
          { post: { authorId: me.id }, NOT: { authorId: me.id } },
          { parent: { authorId: me.id } },
        ],
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        postId: true,
        author: { select: { id: true, name: true, role: true } },
        post: {
          select: {
            id: true,
            version: true,
            revisionNumber: true,
            status: true,
            originalPost: { select: { version: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(relatedComments)
  } catch (error) {
    console.error('Error fetching related comments for supervisor:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}