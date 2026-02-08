export const dynamic = 'force-dynamic'

import React from 'react'
import { PostCard } from '@/components/PostCard'
import { Header } from '@/components/Header'
import Image from 'next/image'
import { ScrollReveal, StaggerContainer, StaggerItem, Parallax } from '@/components/ScrollAnimations'
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
            height="80vh"
          />
        ) : (
          <p className="text-site-muted">{t('noPosts')}</p>
        )}

        <section className="mb-20">
          <ScrollReveal direction="up" className="card rounded-2xl p-8 md:p-12 shadow-2xl border border-site-border/40 bg-gradient-to-br from-site-card via-site-card to-site-secondary/20 relative overflow-hidden">
            {/* Background decorative elements for a floating feel */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-warm-accent/30 to-transparent" />
            
            <Parallax offset={30} className="space-y-8">
              <div className="space-y-6">
                <h2 className="text-3xl md:text-4xl font-extrabold text-warm-accent flex items-center gap-4">
                  <span className="h-10 w-1.5 bg-warm-accent rounded-full" />
                  {t('aboutTitle')}
                </h2>
                <div className="space-y-4 max-w-4xl">
                  <p className="text-site-text leading-9 text-xl opacity-90 font-medium">
                    {t('aboutDesc1')}
                  </p>
                  <p className="text-site-text leading-8 text-lg opacity-80">
                    {t('aboutDesc2')}
                  </p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-12 mt-12 pt-12 border-t border-site-border/30">
                <Parallax offset={60} className="space-y-6 bg-site-secondary/10 p-6 rounded-xl border border-site-border/20 shadow-inner">
                  <h3 className="text-2xl font-bold text-warm-accent flex items-center gap-3">
                    <div className="p-2 bg-warm-accent/10 rounded-lg">
                      <span className="block w-3 h-3 bg-warm-accent rounded-full animate-pulse" />
                    </div>
                    {t('whyImportantTitle')}
                  </h3>
                  <div className="space-y-4">
                    <p className="text-site-text leading-8 text-lg opacity-85">
                      {t('whyImportantDesc1')}
                    </p>
                    <p className="text-site-text leading-8 text-lg opacity-85">
                      {t('whyImportantDesc2')}
                    </p>
                  </div>
                </Parallax>

                <Parallax offset={-40} className="space-y-6 bg-site-secondary/5 p-6 rounded-xl border border-site-border/10">
                  <h3 className="text-2xl font-bold text-warm-accent flex items-center gap-3">
                    <div className="p-2 bg-warm-accent/10 rounded-lg">
                      <span className="block w-3 h-3 bg-warm-accent rounded-full" />
                    </div>
                    {t('structureTitle')}
                  </h3>
                  <StaggerContainer className="text-site-text leading-7 grid sm:grid-cols-1 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <StaggerItem key={i}>
                        <div className="flex items-start gap-3 group p-2 rounded-lg hover:bg-site-secondary/20 transition-all duration-300">
                          <span className="mt-2 w-2 h-2 bg-warm-accent/40 rounded-full group-hover:bg-warm-accent group-hover:scale-125 transition-all" />
                          <span className="text-lg opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all">{t(`structureItem${i}` as any)}</span>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                </Parallax>
              </div>
            </Parallax>
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
