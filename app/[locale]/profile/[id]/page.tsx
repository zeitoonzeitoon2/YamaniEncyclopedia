import { prisma } from '@/lib/prisma'
import { Link } from '@/lib/navigation'
import { Header } from '@/components/Header'
import { getPostDisplayId } from '@/lib/postDisplay'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ProfileEditor from '@/components/ProfileEditor'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: { locale: string; id: string }
  searchParams?: { page?: string; pageSize?: string }
}) {
  const { locale, id } = params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'profile' })
  const tPost = await getTranslations({ locale, namespace: 'postCard' })
  const page = Math.max(1, parseInt(searchParams?.page || '1', 10))
  const pageSize = Math.min(20, Math.max(1, parseInt(searchParams?.pageSize || '10', 10)))
  const skip = (page - 1) * pageSize

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, image: true, role: true, bio: true, createdAt: true },
  })
  if (!user) {
    return (
      <div className="min-h-screen bg-site-bg">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="text-site-text">{t('notFound')}</div>
        </div>
      </div>
    )
  }
  const nameText = user.name || t('unknownUser')
  const roleKey = ['ADMIN', 'SUPERVISOR', 'EDITOR', 'USER'].includes(user.role) ? user.role : 'UNKNOWN'
  const roleLabel = t(`roles.${roleKey}` as never)
  const statusKeyFor = (status: string) =>
    ['PENDING', 'APPROVED', 'REJECTED', 'REVIEWABLE', 'ARCHIVED', 'NEW', 'UNKNOWN'].includes(status)
      ? status
      : 'UNKNOWN'

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
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-start gap-6 mb-8">
          {user.image ? (
            <img src={user.image} alt={nameText} className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <span className="w-24 h-24 rounded-full bg-amber-700/30 text-amber-200 inline-flex items-center justify-center text-3xl">
              {(user.name || t('unknownInitial')).charAt(0)}
            </span>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-site-text heading mb-2">{nameText}</h1>
            <p className="text-site-muted mb-2">
              {t('roleLabel')} {roleLabel}
            </p>
            {user.bio && (
              <div className="bg-site-card border border-site-border rounded-lg p-4 text-site-text">
                <div className="font-semibold mb-1 heading">{t('bioLabel')}</div>
                <div className="whitespace-pre-wrap break-words">{user.bio}</div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-site-text heading">{t('postsTitle', { name: nameText })}</h2>
          <div className="text-sm text-site-muted">{t('totalLabel', { count: total })}</div>
        </div>

        {isOwner && (
          <div className="mb-8">
            <ProfileEditor initialName={user.name} initialBio={user.bio} initialImage={user.image || undefined} />
          </div>
        )}

        {posts.length === 0 ? (
          <div className="card">
            <div className="text-center text-site-text py-8">{t('noPosts')}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/dashboard/editor`} className="block bg-site-card border border-site-border rounded-lg p-3 hover:bg-gray-800/60">
                <div className="flex items-center justify-between">
                  <div className="text-site-text font-medium">
                    {tPost('idLabel')} {getPostDisplayId(post as any, tPost)}
                  </div>
                  <div className="text-site-muted text-sm">{new Date(post.createdAt).toLocaleDateString(locale)}</div>
                </div>
                <div className="text-sm text-site-muted mt-1">
                  {t('statusLabel')} {tPost(`status.${statusKeyFor(post.status)}` as never)}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link href={`/profile/${id}?page=${page-1}&pageSize=${pageSize}`} className="btn-secondary">
              {t('previous')}
            </Link>
          )}
          {(skip + posts.length) < total && (
            <Link href={`/profile/${id}?page=${page+1}&pageSize=${pageSize}`} className="btn-secondary">
              {t('next')}
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
