import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const BUCKET_NAME = process.env.SUPABASE_PUBLIC_BUCKET || 'public-files'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase Env Vars')
    }

    const reqContentType = request.headers.get('content-type') || ''
    if (!reqContentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size too large (max 5MB)' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = file.type
    const safeName = file.name.replace(/[^\x00-\x7F]/g, '')
    const ext = safeName.includes('.') ? safeName.split('.').pop() : undefined
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`
    const path = `article-images/${filename}`

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

    return NextResponse.json({ url: data.publicUrl })
  } catch (error) {
    console.error('Article image upload error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
