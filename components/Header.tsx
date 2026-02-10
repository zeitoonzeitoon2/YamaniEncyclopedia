'use client'

import { useSession, signOut } from 'next-auth/react'
import React from 'react'
import { Link, usePathname, useRouter } from '@/lib/navigation'
import Image from 'next/image'
import { User, LogOut, Edit, Settings, Sun, Moon, Languages, LogIn } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import { locales } from '@/i18n'

export function Header() {
  const { data: session, status } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [displayRole, setDisplayRole] = React.useState<string | undefined>(undefined)
  const [isDomainExpert, setIsDomainExpert] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [langMenuOpen, setLangMenuOpen] = React.useState(false)
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [profileImageError, setProfileImageError] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const langMenuRef = React.useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const rawPathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('header')
  const tl = useTranslations('language')
  const pathname = rawPathname || '/'
  const safePathname = React.useMemo(() => {
    if (!pathname.startsWith('/')) return `/${pathname}`
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return '/'
    if (locales.includes(segments[0] as (typeof locales)[number])) {
      const rest = segments.slice(1).join('/')
      return rest ? `/${rest}` : '/'
    }
    return pathname
  }, [pathname])
  const isAcademy = safePathname.startsWith('/academy')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    let active = true
    fetch('/api/admin/settings?type=logo', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (active) setLogoUrl(data?.url || null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (status !== 'authenticated') return
    // Sync role label with server to avoid stale client token
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setDisplayRole(data?.role)
          setIsDomainExpert(!!data?.isDomainExpert)
        } else {
          setDisplayRole(session?.user?.role)
          setIsDomainExpert(false)
        }
      } catch {
        setDisplayRole(session?.user?.role)
        setIsDomainExpert(false)
      }
    })()
  }, [status, session?.user?.role])

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false)
      if (langMenuRef.current && !langMenuRef.current.contains(target)) setLangMenuOpen(false)
    }
    if (menuOpen || langMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, langMenuOpen])

  const effectiveRole = (displayRole || session?.user?.role) || ''
  const isSupervisorLike = isDomainExpert || ['SUPERVISOR', 'ADMIN'].includes(effectiveRole)
  const isEditorLike = !isSupervisorLike && ['EDITOR', 'USER'].includes(effectiveRole)

  return (
    <header className="bg-site-card border-b border-site-border relative z-50">
      <div className="container mx-auto px-4 py-2">
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="flex items-center justify-start">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-site-text heading">
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt={t('logoAlt')} 
                  width={32} 
                  height={32} 
                  className="h-8 w-8 object-contain" 
                  unoptimized 
                  onError={() => setLogoUrl(null)}
                />
              ) : null}
              <span className="hidden sm:inline">{t('title')}</span>
            </Link>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center rounded-full bg-site-border/40 p-0.5 border border-site-border/50">
              <Link
                href="/"
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  isAcademy ? 'text-site-muted hover:text-site-text' : 'bg-warm-primary/20 text-site-text font-medium'
                }`}
              >
                {t('encyclopedia')}
              </Link>
              <Link
                href="/academy"
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  isAcademy ? 'bg-warm-primary/20 text-site-text font-medium' : 'text-site-muted hover:text-site-text'
                }`}
              >
                {t('academy')}
              </Link>
            </div>
          </div>

          <nav className="flex items-center justify-end">
            {!mounted || status === 'loading' ? (
              <div className="w-8 h-8 bg-site-border rounded-full animate-pulse"></div>
            ) : session ? (
              <div className="flex items-center gap-0.5 p-0.5 bg-site-border/20 backdrop-blur-md border border-site-border/80 rounded-full shadow-md hover:border-warm-primary/50 transition-all">
                <div className="flex items-center">
                  {mounted ? (
                    <button
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="p-2 rounded-full hover:bg-site-border/40 transition-colors text-site-text"
                      aria-label={t('themeToggle')}
                    >
                      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                  ) : (
                    <div className="w-8 h-8" /> // Stable placeholder
                  )}
                </div>

                <div className="relative" ref={langMenuRef}>
                  <button
                    onClick={() => setLangMenuOpen((prev) => !prev)}
                    className="p-2 rounded-full hover:bg-site-border/40 transition-colors text-site-text"
                    aria-label={tl('label')}
                  >
                    <Languages size={16} />
                  </button>
                  {langMenuOpen && (
                    <div className="absolute end-0 mt-2 w-32 rounded-lg border border-gray-700 bg-site-secondary shadow-xl overflow-hidden z-50">
                      <div className="py-1">
                        {['ar', 'fa', 'en'].map((l) => (
                          <button
                            key={l}
                            onClick={() => {
                              router.replace(safePathname, { locale: l })
                              setLangMenuOpen(false)
                            }}
                            className={`w-full text-start px-4 py-2 text-sm hover:bg-site-card/60 transition-colors ${
                              locale === l ? 'text-warm-primary font-bold' : 'text-site-text'
                            }`}
                          >
                            {tl(l)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-px h-5 bg-site-border/50 mx-1" />

                {!isAcademy && (
                  <Link 
                    href="/create" 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-primary hover:bg-warm-primary-hover text-white rounded-full transition-all text-xs font-bold shadow-sm hover:shadow-md active:scale-95"
                  >
                    <Edit size={14} />
                    <span className="hidden sm:inline">{t('newEdit')}</span>
                  </Link>
                )}

                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="flex items-center p-0.5 rounded-full hover:ring-2 hover:ring-warm-primary/30 transition-all ml-1"
                  >
                    {session.user?.image && !profileImageError ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name || ''}
                        width={28}
                        height={28}
                        className="rounded-full border border-site-border/50"
                        onError={() => setProfileImageError(true)}
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-site-border flex items-center justify-center text-site-text">
                        <User size={14} />
                      </span>
                    )}
                  </button>
                  {menuOpen && (
                    <div className="absolute end-0 mt-2 w-56 rounded-lg border border-gray-700 bg-site-secondary shadow-xl overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-gray-700">
                        <div className="text-site-text text-sm font-semibold truncate">{session.user?.name || '—'}</div>
                        <div className="text-site-muted text-xs truncate">{session.user?.email || ''}</div>
                      </div>
                      <div className="py-1">
                        <Link
                          href={`/profile/${session.user?.id}`}
                          className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                        >
                          <User size={16} />
                          {t('profile')}
                        </Link>
                        {session && (
                          <Link
                            href="/supervisor"
                            className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                          >
                            {isEditorLike ? <Edit size={16} /> : <Settings size={16} />}
                            {isEditorLike ? t('editorDashboard') : t('supervisorDashboard')}
                          </Link>
                        )}
                        {(isDomainExpert || session.user?.role === 'ADMIN') && (
                          <Link
                            href="/dashboard/admin"
                            className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                          >
                            <Settings size={16} />
                            {t('adminDashboard')}
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => signOut()}
                          className="w-full text-start px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                        >
                          <LogOut size={16} />
                          {t('signOut')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/signin"
                  className="px-4 py-1.5 text-sm font-medium text-site-text hover:bg-site-border/30 rounded-full transition-all border border-transparent hover:border-site-border/50 flex items-center gap-2"
                >
                  <LogIn size={16} />
                  {t('signIn')}
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-5 py-1.5 text-sm font-bold bg-warm-primary hover:bg-warm-accent text-white rounded-full transition-all shadow-sm hover:shadow-md active:scale-95"
                >
                  {t('signUp')}
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
