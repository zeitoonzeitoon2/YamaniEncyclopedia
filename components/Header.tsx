import React from 'react'
import { Link } from '@/lib/navigation'
import Image from 'next/image'
import { getTranslations, getLocale } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { HeaderClient } from './HeaderClient'

export async function Header() {
  const t = await getTranslations('header')
  const locale = await getLocale()
  
  let logoUrl = null
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'site.logo' }
    })
    logoUrl = setting?.value || null
  } catch (err) {
    console.warn('[Header] Failed to fetch logo setting.')
  }

  return (
    <header className="bg-site-card border-b border-site-border fixed top-0 left-0 right-0 z-[999999] w-full" style={{ isolation: 'isolate' }}>
      <div className="container mx-auto px-4 py-2">
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="flex items-center justify-start relative z-[1001] pointer-events-auto">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-site-text heading">
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt={t('logoAlt')} 
                  width={32} 
                  height={32} 
                  className="h-8 w-8 object-contain" 
                  unoptimized 
                />
              ) : null}
              <span className="hidden sm:inline">{t('title')}</span>
            </Link>
          </div>

          <HeaderClient initialLocale={locale} />
        </div>
      </div>
    </header>
  )
}
