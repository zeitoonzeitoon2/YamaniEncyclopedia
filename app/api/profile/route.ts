import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, image: true, role: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(user)
  } catch (error: any) {
    console.error('GET /api/profile error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let body: any
    try {
      body = await request.json()
    } catch (e: any) {
      console.error('Invalid JSON body for profile PUT:', e)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const name: string | undefined = body?.name
    const image: string | undefined = body?.image
    const bio: string | undefined = body?.bio
    const data: any = {}
    if (typeof name === 'string') {
      data.name = name.trim().slice(0, 120)
    }
    if (typeof image === 'string') {
      const trimmed = image.trim()
      if (trimmed.length === 0) {
        data.image = null
      } else {
        const isWeb = /^https?:\/\/.+/i.test(trimmed)
        const isRelative = /^\/.+/.test(trimmed)
        const isData = /^data:image\/(png|jpeg|webp);base64,/i.test(trimmed)
        const isBlob = /^blob:/i.test(trimmed)
        if (!isWeb && !isRelative && !isData && !isBlob) {
          return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
        }
        data.image = trimmed
      }
    }
    if (typeof bio === 'string') {
      data.bio = bio.trim().slice(0, 2000)
    }
    if (!('name' in data) && !('image' in data)) {
      if (!('bio' in data)) {
        return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
      }
    }
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true, email: true, name: true, image: true, role: true, bio: true },
    })
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('PUT /api/profile error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}