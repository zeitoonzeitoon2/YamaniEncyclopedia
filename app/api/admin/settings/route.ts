import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const HEADER_KEY = 'header_image'
const LEGACY_HEADER_KEY = 'home.headerImage'
const LOGO_KEY = 'site.logo'
const BUCKET_NAME = process.env.SUPABASE_PUBLIC_BUCKET || 'public-files'

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'header'
    if (type === 'logo') {
      const logo = await prisma.setting.findUnique({ where: { key: LOGO_KEY } })
      return NextResponse.json({ url: logo?.value || null })
    }
    const primary = await prisma.setting.findUnique({ where: { key: HEADER_KEY } })
    if (primary?.value) return NextResponse.json({ url: primary.value })
    const legacy = await prisma.setting.findUnique({ where: { key: LEGACY_HEADER_KEY } })
    return NextResponse.json({ url: legacy?.value || null })
  } catch (error: any) {
    console.error('Admin settings GET error:', error)
    return NextResponse.json({ url: null, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Env Vars')
    }

    const reqContentType = request.headers.get('content-type') || ''
    if (!reqContentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'فایل ارسال نشده است' }, { status: 400 })
    }

    const type = String(formData.get('type') || 'header')
    if (type !== 'header' && type !== 'logo') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const MAX_SIZE = 5 * 1024 * 1024
    if ((file as any).size > MAX_SIZE) {
      return NextResponse.json({ error: 'حجم فایل باید حداکثر 5 مگابایت باشد' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = (file as any).type || 'application/octet-stream'
    const originalName = (file as any).name || 'upload'
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const ext = safeName.includes('.') ? safeName.split('.').pop() : undefined
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`
    const path = `${type === 'logo' ? 'site-logos' : 'header-images'}/${filename}`

    const { error: uploadError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(path, buffer, { contentType })

    if (uploadError) {
      throw new Error(uploadError.message || 'Upload failed')
    }

    const { data } = supabase
      .storage
      .from(BUCKET_NAME)
      .getPublicUrl(path)

    const publicUrl = data.publicUrl

    if (type === 'logo') {
      await prisma.setting.upsert({
        where: { key: LOGO_KEY },
        create: { key: LOGO_KEY, value: publicUrl },
        update: { value: publicUrl },
      })
    } else {
      await prisma.$transaction([
        prisma.setting.upsert({
          where: { key: HEADER_KEY },
          create: { key: HEADER_KEY, value: publicUrl },
          update: { value: publicUrl },
        }),
        prisma.setting.upsert({
          where: { key: LEGACY_HEADER_KEY },
          create: { key: LEGACY_HEADER_KEY, value: publicUrl },
          update: { value: publicUrl },
        }),
      ])
    }

    return NextResponse.json({ url: publicUrl, type })
  } catch (error) {
    console.error('Admin settings upload error:', error)
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unknown error')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
