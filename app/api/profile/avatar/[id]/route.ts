import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { avatarBytes: true, avatarMime: true },
    })
    if (!user || !user.avatarBytes) {
      return new NextResponse('Not Found', { status: 404 })
    }
    const mime = user.avatarMime || 'image/png'
    return new NextResponse(user.avatarBytes as any, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error: any) {
    console.error('GET /api/profile/avatar/[id] error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}