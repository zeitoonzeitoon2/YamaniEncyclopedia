export const dynamic = 'force-dynamic'

import React from 'react'
import { PostCard } from '@/components/PostCard'
import { prisma } from '@/lib/prisma'
import { Header } from '@/components/Header'
import Image from 'next/image'
import { getTopVotedApprovedPost } from '@/lib/postUtils'
import { useTranslations } from 'next-intl'

export default function HomePage() {
  const t = useTranslations('home')
  const [topVotedPost, setTopVotedPost] = React.useState<any>(null)
  const [headerUrl, setHeaderUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function fetchData() {
      const post = await getTopVotedApprovedPost()
      setTopVotedPost(post)

      try {
        const res = await fetch('/api/settings?key=home.headerImage')
        if (res.ok) {
          const data = await res.json()
          setHeaderUrl(data.value || null)
        }
      } catch (err) {
        console.warn('[HomePage] Failed to fetch header image setting.')
      }
    }
    fetchData()
  }, [])

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        {headerUrl && (
          <div className="relative h-48 md:h-64 lg:h-80 mb-8">
            <Image src={headerUrl} alt={t('headerAlt')} fill className="object-cover rounded-xl" priority unoptimized />
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6 text-site-text">{t('topDiagram')}</h1>
        <div className="mb-12">
          {topVotedPost ? (
            <PostCard post={topVotedPost as any} fullWidth={true} hideArticleLinkInputs={true} hideAuthorName={true} hideAuthorAvatar={true} />
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

        <div className="mt-12 border-t border-site-border pt-6 text-sm text-site-muted">
          <p>
            {t('footerQuote')}
          </p>
        </div>
      </div>
    </>
  )
}
