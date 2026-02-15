import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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
