import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getPostDisplayId } from '@/lib/postDisplay'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ProfileEditor from '@/components/ProfileEditor'

export default async function ProfilePage({ params, searchParams }: { params: { id: string }, searchParams?: { page?: string, pageSize?: string } }) {
  const id = params.id
  const page = Math.max(1, parseInt(searchParams?.page || '1', 10))
  const pageSize = Math.min(20, Math.max(1, parseInt(searchParams?.pageSize || '10', 10)))
  const skip = (page - 1) * pageSize

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, image: true, role: true, bio: true, createdAt: true },
  })
  if (!user) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">المستخدم غير موجود</div>
      </div>
    )
  }

  const posts = await prisma.post.findMany({
    where: { authorId: id },
    select: {
      id: true, content: true, status: true, version: true, revisionNumber: true, createdAt: true, type: true,
      originalPost: { select: { id: true, version: true } },
      author: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip, take: pageSize,
  })
  const total = await prisma.post.count({ where: { authorId: id } })

  const session = await getServerSession(authOptions)
  const isOwner = session?.user?.id === id

  return (
    <div className="min-h-screen bg-dark-bg">
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-start gap-6 mb-8">
          {user.image ? (
            <img src={user.image} alt={user.name || ''} className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <span className="w-24 h-24 rounded-full bg-amber-700/30 text-amber-200 inline-flex items-center justify-center text-3xl">
              {(user.name || '؟').charAt(0)}
            </span>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-dark-text heading mb-2">{user.name || 'مستخدم'}</h1>
            <p className="text-dark-muted mb-2">الدور: {user.role}</p>
            {user.bio && (
              <div className="bg-dark-card border border-dark-border rounded-lg p-4 text-dark-text">
                <div className="font-semibold mb-1 heading">السيرة الذاتية</div>
                <div className="whitespace-pre-wrap break-words">{user.bio}</div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark-text heading">منشورات {user.name || ''}</h2>
          <div className="text-sm text-dark-muted">الإجمالي: {total}</div>
        </div>

        {isOwner && (
          <div className="mb-8">
            <ProfileEditor initialName={user.name} initialBio={user.bio} initialImage={user.image || undefined} />
          </div>
        )}

        {posts.length === 0 ? (
          <div className="card">
            <div className="text-center text-dark-text py-8">لا توجد منشورات</div>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/dashboard/editor`} className="block bg-dark-card border border-dark-border rounded-lg p-3 hover:bg-gray-800/60">
                <div className="flex items-center justify-between">
                  <div className="text-dark-text font-medium">المعرّف: {getPostDisplayId(post as any)}</div>
                  <div className="text-dark-muted text-sm">{new Date(post.createdAt).toLocaleDateString('ar')}</div>
                </div>
                <div className="text-sm text-dark-muted mt-1">الحالة: {post.status}</div>
              </Link>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link href={`/profile/${id}?page=${page-1}&pageSize=${pageSize}`} className="btn-secondary">السابق</Link>
          )}
          {(skip + posts.length) < total && (
            <Link href={`/profile/${id}?page=${page+1}&pageSize=${pageSize}`} className="btn-secondary">التالي</Link>
          )}
        </div>
      </main>
    </div>
  )
}