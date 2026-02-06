export const dynamic = 'force-dynamic'

import React from 'react'
import { PostCard } from '@/components/PostCard'
import { Header } from '@/components/Header'
import Image from 'next/image'
import { getTopVotedApprovedPost } from '@/lib/postUtils'
import { getPostDisplayId } from '@/lib/postDisplay'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'home' })
  
  let topVotedPost = null
  try {
    const rawPost = await getTopVotedApprovedPost()
    if (rawPost) {
      // Pick only serializable fields needed by PostCard
      topVotedPost = {
        id: rawPost.id,
        version: rawPost.version,
        revisionNumber: rawPost.revisionNumber,
        status: rawPost.status,
        content: rawPost.content,
        type: rawPost.type,
        createdAt: rawPost.createdAt instanceof Date ? rawPost.createdAt.toISOString() : rawPost.createdAt,
        author: rawPost.author ? {
          name: rawPost.author.name,
          image: rawPost.author.image,
        } : null,
        originalPost: rawPost.originalPost ? {
          version: rawPost.originalPost.version
        } : null
      }
    }
  } catch (err) {
    console.error('[HomePage] Failed to fetch top voted post:', err)
  }
  
  let headerUrl: string | null = null
  try {
    const { prisma } = await import('@/lib/prisma')
    const setting = await prisma.setting.findUnique({
      where: { key: 'home.headerImage' }
    })
    headerUrl = setting?.value || null
  } catch (err) {
    console.warn('[HomePage] Failed to fetch header image setting.')
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        {headerUrl && (
          <div className="relative h-48 md:h-64 lg:h-80 mb-8">
            <Image src={headerUrl} alt={t('headerAlt')} fill className="object-cover rounded-xl" priority unoptimized />
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-site-border pb-4">
          <div className="flex flex-wrap items-center gap-6">
            <h1 className="text-2xl font-bold text-site-text">{t('topDiagram')}</h1>
            {topVotedPost && (
              <span className="text-site-muted font-medium bg-site-secondary px-3 py-1 rounded-lg border border-site-border flex items-center gap-1">
                <span className="opacity-70 text-sm">{t('postCard.idLabel', { defaultValue: 'شناسه:' })}</span>
                <span className="text-warm-accent font-bold">{getPostDisplayId(topVotedPost as any, (key: string) => t(key))}</span>
              </span>
            )}
          </div>
          <div id="home-top-diagram-actions" className="flex items-center gap-2">
            {/* TreeDiagramEditor portal will render its button here */}
          </div>
        </div>
        <div className="mb-12">
          {topVotedPost ? (
            <PostCard 
              post={topVotedPost as any} 
              fullWidth={true} 
              hideArticleLinkInputs={true} 
              hideAuthorName={true} 
              hideAuthorAvatar={true} 
              hideHeaderId={true} 
              showDomainNamesAtTop={true}
              actionsPortalId="home-top-diagram-actions"
            />
          ) : (
            <p className="text-site-muted">{t('noPosts')}</p>
          )}
        </div>

        <section className="mb-10">
          <div className="card rounded-xl p-6 md:p-8 space-y-4">
            <h2 className="text-2xl md:text-3xl font-extrabold text-warm-accent">{t('aboutTitle')}</h2>
            <p className="text-site-text leading-8">
              {t('aboutDesc1')}
            </p>
            <p className="text-site-text leading-8">
              {t('aboutDesc2')}
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">{t('whyImportantTitle')}</h3>
            <p className="text-site-text leading-7">
              {t('whyImportantDesc1')}
            </p>
            <p className="text-site-text leading-7">
              {t('whyImportantDesc2')}
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">{t('structureTitle')}</h3>
            <ul className="text-site-text leading-7 space-y-1 list-disc pr-6">
              <li>{t('structureItem1')}</li>
              <li>{t('structureItem2')}</li>
              <li>{t('structureItem3')}</li>
              <li>{t('structureItem4')}</li>
              <li>{t('structureItem5')}</li>
              <li>{t('structureItem6')}</li>
              <li>{t('structureItem7')}</li>
              <li>{t('structureItem8')}</li>
            </ul>
          </div>
        </section>

        <div className="mt-12 border-t border-site-border pt-6 text-sm text-site-muted text-center">
          <p>
            {t('footerQuote')}
          </p>
        </div>
      </div>
    </>
  )
}
