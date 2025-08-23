import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextRevisionNumber } from '@/lib/postUtils'

// API endpoint for posts

export async function POST(request: NextRequest) {
  console.log('POST /api/posts called - NEW VERSION')
  try {
    const session = await getServerSession(authOptions)
    console.log('Session:', session)
    
    if (!session?.user?.email) {
      console.log('No session or email found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, type = 'TREE', originalPostId, articlesData } = await request.json()
    console.log('Request data received:', { 
      content: content ? `${content.substring(0, 100)}...` : null,
      type, 
      originalPostId, 
      articlesData: articlesData ? `${articlesData.substring(0, 100)}...` : null
    })

    // داده‌های مقالات همان ورودی articlesData از کلاینت است؛ استخراج draftId دیگر انجام نمی‌شود
    const finalArticlesData = articlesData

    if (!content) {
      console.log('No content provided')
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    console.log('Finding user by email:', session.user.email)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })
    console.log('User found:', user)

    if (!user) {
      console.log('User not found in database')
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let version = null
    let revisionNumber = null

    if (originalPostId) {
      console.log('This is an edit, generating revision number for originalPostId:', originalPostId)
      // این یک ویرایش پیشنهادی است
      revisionNumber = await generateNextRevisionNumber(originalPostId)
      console.log('Generated revision number:', revisionNumber)
    } else {
      console.log('This is a new post, version and revisionNumber will be null until approval')
      // این یک نمودار جدید است که در انتظار تایید است
      // version و revisionNumber null می‌مانند تا زمان تایید
    }

    console.log('Creating post with data:', {
      content: content ? `${content.substring(0, 50)}...` : null,
      type,
      authorId: user.id,
      status: 'PENDING',
      version,
      revisionNumber,
      articlesData: finalArticlesData ? `${finalArticlesData.substring(0, 50)}...` : null,
      originalPostId
    })

    const post = await prisma.post.create({
      data: {
        content,
        type,
        authorId: user.id,
        status: 'PENDING',
        version,
        revisionNumber,
        ...(finalArticlesData ? { articlesData: finalArticlesData } : {}),
        ...(originalPostId ? { originalPostId } : {})
      }
    })

    console.log('Post created successfully:', post.id)
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    console.error('Error creating post - Full error details:')
    console.error('Error name:', error instanceof Error ? error.name : undefined)
    console.error('Error message:', error instanceof Error ? error.message : (typeof error === 'string' ? error : undefined))
    const anyErr = error as any
    console.error('Error code:', anyErr?.code)
    console.error('Error stack:', error instanceof Error ? error.stack : undefined)
    if (anyErr?.meta) {
      console.error('Error meta:', anyErr.meta)
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' 
        ? (error instanceof Error ? error.message : (typeof error === 'string' ? error : undefined)) 
        : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            name: true,
            image: true
          }
        },
        votes: {
          select: {
            score: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // محاسبه امتیاز کل و فیلتر کردن پست‌ها
    const postsWithScores = posts.map(post => {
      const totalScore = post.votes.reduce((sum, vote) => sum + vote.score, 0)
      const hasVotes = post.votes.length > 0
      return {
        ...post,
        totalScore,
        hasVotes,
        votes: undefined // حذف votes از response برای امنیت
      }
    })

    // نمایش فقط پست‌هایی که حداقل یک رای دارند و امتیاز مثبت دارند
    const publishedPosts = postsWithScores.filter(post => 
      post.hasVotes && post.totalScore > 0
    )

    // مرتب‌سازی بر اساس امتیاز (بیشترین امتیاز اول)
    publishedPosts.sort((a, b) => b.totalScore - a.totalScore)

    // نمایش فقط بالاترین امتیاز
    const topPost = publishedPosts.length > 0 ? [publishedPosts[0]] : []

    return NextResponse.json(topPost)
  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}