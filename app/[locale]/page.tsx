export const dynamic = 'force-dynamic'

import React from 'react'
import { PostCard } from '@/components/PostCard'
import { Header } from '@/components/Header'
import Image from 'next/image'
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/ScrollAnimations'
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
      <div className="container mx-auto px-4 py-8 overflow-x-hidden">
        {headerUrl && (
          <ScrollReveal direction="none" distance={0} duration={1} className="relative h-48 md:h-64 lg:h-80 mb-8 overflow-hidden rounded-xl shadow-2xl">
            <Image 
              src={headerUrl} 
              alt={t('headerAlt')} 
              fill 
              className="object-cover transition-transform duration-700 hover:scale-105" 
              priority 
              unoptimized 
            />
          </ScrollReveal>
        )}

        <ScrollReveal direction="down" delay={0.2} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-site-border pb-4">
          <div className="flex flex-wrap items-center gap-6">
            <h1 className="text-2xl font-bold text-site-text">{t('topDiagram')}</h1>
            {topVotedPost && (
              <span className="text-site-muted font-medium bg-site-secondary px-3 py-1 rounded-lg border border-site-border flex items-center gap-1">
                <span className="opacity-70 text-sm">{t('idLabel')}</span>
                <span className="text-warm-accent font-bold">{getPostDisplayId(topVotedPost as any, (key: string) => t(key))}</span>
              </span>
            )}
          </div>
          <div id="home-top-diagram-actions" className="flex items-center gap-2">
            {/* TreeDiagramEditor portal will render its button here */}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.4} className="mb-12">
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
        </ScrollReveal>

        <section className="mb-10">
          <ScrollReveal direction="up" className="card rounded-xl p-6 md:p-8 space-y-6 shadow-xl border border-site-border/50 bg-gradient-to-br from-site-card to-site-secondary/30">
            <h2 className="text-2xl md:text-3xl font-extrabold text-warm-accent border-r-4 border-warm-accent pr-4">{t('aboutTitle')}</h2>
            <div className="space-y-4">
              <p className="text-site-text leading-8 text-lg opacity-90">
                {t('aboutDesc1')}
              </p>
              <p className="text-site-text leading-8 opacity-80">
                {t('aboutDesc2')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mt-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-warm-accent flex items-center gap-2">
                  <span className="w-2 h-2 bg-warm-accent rounded-full" />
                  {t('whyImportantTitle')}
                </h3>
                <p className="text-site-text leading-7 opacity-80">
                  {t('whyImportantDesc1')}
                </p>
                <p className="text-site-text leading-7 opacity-80">
                  {t('whyImportantDesc2')}
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-warm-accent flex items-center gap-2">
                  <span className="w-2 h-2 bg-warm-accent rounded-full" />
                  {t('structureTitle')}
                </h3>
                <StaggerContainer className="text-site-text leading-7 space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <StaggerItem key={i}>
                      <li className="list-none flex items-start gap-2 group">
                        <span className="mt-2 w-1.5 h-1.5 bg-warm-accent/40 rounded-full group-hover:bg-warm-accent transition-colors" />
                        <span className="opacity-80 group-hover:opacity-100 transition-opacity">{t(`structureItem${i}` as any)}</span>
                      </li>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </div>
            </div>
          </ScrollReveal>
        </section>

        <ScrollReveal direction="none" delay={0.5} className="mt-12 border-t border-site-border pt-8 text-sm text-site-muted text-center italic">
          <p className="max-w-2xl mx-auto opacity-70">
            {t('footerQuote')}
          </p>
        </ScrollReveal>
      </div>
    </>
  )
}
