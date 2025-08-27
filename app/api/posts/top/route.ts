import { NextResponse } from 'next/server'
import { getTopVotedApprovedPost } from '@/lib/postUtils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const topPost = await getTopVotedApprovedPost()

    return NextResponse.json(topPost || null, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('خطا در گرفتن نمودار اصلی:', error)
    return NextResponse.json(
      { error: 'خطا در گرفتن نمودار اصلی' },
      { status: 500 }
    )
  }
}