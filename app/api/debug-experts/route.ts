import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'ADMIN'
  const isDev = process.env.NODE_ENV !== 'production'
  if (!isDev && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const philosophy = await prisma.domain.findUnique({
    where: { slug: 'philosophy' },
    include: {
      experts: {
        include: {
          user: { select: { email: true, name: true } }
        }
      }
    }
  })

  const users = await prisma.user.findMany({
    where: {
      email: { in: ['a@gmail.com', 'h@gmail.com'] }
    },
    include: {
      domainExperts: {
        include: {
          domain: { select: { name: true, slug: true } }
        }
      }
    }
  })

  return NextResponse.json({
    philosophy,
    users
  })
}
