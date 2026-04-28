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
    <header className="sticky top-0 left-0 right-0 w-full h-14 sm:h-16 bg-site-card border-b border-site-border z-[999] pointer-events-auto" style={{ isolation: 'isolate' }}>
      <div className="container mx-auto px-2 sm:px-4 py-1.5 sm:py-2">
        <div className="flex items-center justify-between gap-1 sm:gap-4">
          <div className="flex items-center justify-start shrink-0 relative z-[1001]">
            <a href={`/${locale}`} className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl font-bold text-site-text heading">
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt={t('logoAlt')} 
                  width={28} 
                  height={28} 
                  className="h-7 w-7 sm:h-8 sm:w-8 object-contain" 
                  unoptimized 
                />
              ) : null}
              <span className="hidden lg:inline">{t('title')}</span>
            </a>
          </div>

          <HeaderClient initialLocale={locale} />
        </div>
      </div>
    </header>
  )
}
