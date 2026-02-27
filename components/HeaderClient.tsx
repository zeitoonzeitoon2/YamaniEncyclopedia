'use client'

import { useSession, signOut } from 'next-auth/react'
import React from 'react'
import { Link, usePathname, useRouter } from '@/lib/navigation'
import Image from 'next/image'
import { User, LogOut, Edit, Settings, Sun, Moon, Languages, LogIn, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import { locales } from '@/i18n'
import { PageGuide } from './PageGuide'

interface HeaderClientProps {
  initialLocale: string
}

export function HeaderClient({ initialLocale }: HeaderClientProps) {
  const { data: session, status } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [displayRole, setDisplayRole] = React.useState<string | undefined>(undefined)
  const [isDomainExpert, setIsDomainExpert] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [langMenuOpen, setLangMenuOpen] = React.useState(false)
  const [profileImageError, setProfileImageError] = React.useState(false)
  const [notifications, setNotifications] = React.useState<{ total: number; items: Array<{ type: string; id: string; title: string; domainName?: string; createdAt: string }> }>({ total: 0, items: [] })
  const [notifOpen, setNotifOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const langMenuRef = React.useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const rawPathname = usePathname()
  const locale = useLocale() || initialLocale
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
    if (status !== 'authenticated') return
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
    if (status !== 'authenticated') return
    let cancelled = false
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { credentials: 'include' })
        if (res.ok && !cancelled) {
          const data = await res.json()
          setNotifications(data)
        }
      } catch { /* silent */ }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [status])

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false)
      if (langMenuRef.current && !langMenuRef.current.contains(target)) setLangMenuOpen(false)
    }
    if (menuOpen || langMenuOpen) document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpen, langMenuOpen])

  const effectiveRole = (displayRole || session?.user?.role) || ''
  const isExpertLike = isDomainExpert || ['EXPERT', 'ADMIN'].includes(effectiveRole)
  const isEditorLike = !isExpertLike && ['EDITOR', 'USER'].includes(effectiveRole)

  if (!mounted) {
    return (
      <div className="col-span-2 grid grid-cols-2 items-center gap-4">
        <div className="flex justify-center">
          <div className="w-32 h-8 bg-site-border/20 rounded-full animate-pulse"></div>
        </div>
        <div className="flex justify-end">
          <div className="w-8 h-8 bg-site-border/20 rounded-full animate-pulse"></div>
        </div>
      </div>
    )
  }

  const getLocalizedHref = (path: string) => {
    return `/${locale}${path === '/' ? '' : path}`
  }

  return (
    <>
      <div className="flex items-center justify-center relative z-[1001]">
        <div className="flex items-center rounded-full bg-site-border/40 p-0.5 border border-site-border/50">
          <a
            href={getLocalizedHref('/')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              isAcademy ? 'text-site-muted hover:text-site-text' : 'bg-warm-primary/20 text-site-text font-medium'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
            }}
          >
            {t('encyclopedia')}
          </a>
          <a
            href={getLocalizedHref('/academy')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              isAcademy ? 'bg-warm-primary/20 text-site-text font-medium' : 'text-site-muted hover:text-site-text'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
            }}
          >
            {t('academy')}
          </a>
        </div>
      </div>

      <nav className="flex items-center justify-end gap-3 relative z-[1001]">
        <div className="flex items-center gap-0.5 p-0.5 bg-site-border/20 backdrop-blur-md border border-site-border/80 rounded-full shadow-md hover:border-warm-primary/50 transition-all">
          <PageGuide />
          
          <div className="flex items-center">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full hover:bg-site-border/40 transition-colors text-site-text"
              aria-label={t('themeToggle')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="relative" ref={langMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLangMenuOpen((prev) => !prev);
              }}
              className="p-2 rounded-full hover:bg-site-border/40 transition-colors text-site-text"
              aria-label={tl('label')}
            >
              <Languages size={16} />
            </button>
            {langMenuOpen && (
              <div className="absolute end-0 mt-2 w-32 rounded-lg border border-gray-700 bg-site-secondary shadow-xl overflow-hidden z-[1010]">
                <div className="py-1">
                  {['ar', 'fa', 'en'].map((l) => (
                    <button
                      key={l}
                      onClick={(e) => {
                        e.stopPropagation()
                        setLangMenuOpen(false)
                        window.location.href = `/${l}${safePathname === '/' ? '' : safePathname}`
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

          {session && (
            <>
              <div className="w-px h-5 bg-site-border/50 mx-1" />
              {!isAcademy && (
                <a 
                  href={getLocalizedHref('/create')} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-primary hover:bg-warm-primary-hover text-white rounded-full transition-all text-xs font-bold shadow-sm hover:shadow-md active:scale-95"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                  }}
                >
                  <Edit size={14} />
                  <span className="hidden sm:inline">{t('newEdit')}</span>
                </a>
              )}

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((prev) => !prev);
                  }}
                  className="relative flex items-center p-0.5 rounded-full hover:ring-2 hover:ring-warm-primary/30 transition-all ml-1"
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
                  {notifications.total > 0 && (
                    <span className="absolute -top-1 -end-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 ring-2 ring-site-bg">
                      {notifications.total > 99 ? '99+' : notifications.total}
                    </span>
                  )}
                </button>
                {menuOpen && (
                  <div className="absolute end-0 mt-2 w-72 rounded-lg border border-gray-700 bg-site-secondary shadow-xl overflow-hidden z-[1010]">
                    <div className="px-4 py-3 border-b border-gray-700">
                      <div className="text-site-text text-sm font-semibold truncate">{session.user?.name || session.user?.email || '—'}</div>
                      <div className="text-site-muted text-xs truncate">{session.user?.email || ''}</div>
                    </div>
                    <div className="py-1">
                      {/* Notifications Section */}
                      {notifications.total > 0 && (
                        <div className="border-b border-gray-700/50">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setNotifOpen(prev => !prev)
                            }}
                            className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                          >
                            <Bell size={16} className="text-amber-400" />
                            <span className="flex-1">{t('notifications')}</span>
                            <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500/90 text-white text-[10px] font-bold px-1.5">
                              {notifications.total}
                            </span>
                            {notifOpen ? <ChevronUp size={14} className="text-site-muted" /> : <ChevronDown size={14} className="text-site-muted" />}
                          </button>
                          {notifOpen && (
                            <div className="max-h-60 overflow-y-auto">
                              {notifications.items.map((item) => (
                                <a
                                  key={`${item.type}-${item.id}`}
                                  href={getLocalizedHref(
                                    item.type === 'post' ? `/expert` : '/dashboard/admin'
                                  )}
                                  className="block px-4 py-2 hover:bg-site-card/40 border-t border-gray-700/30"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMenuOpen(false)
                                  }}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                    <div className="min-w-0">
                                      <div className="text-xs text-site-text truncate">{item.title}</div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-site-border/30 text-site-muted">
                                          {t(`notifType_${item.type}`)}
                                        </span>
                                        {item.domainName && (
                                          <span className="text-[10px] text-site-muted truncate">{item.domainName}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <a
                        href={getLocalizedHref(`/profile/${session.user?.id}`)}
                        className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                        }}
                      >
                        <User size={16} />
                        {t('profile')}
                      </a>
                      {(isExpertLike || isEditorLike) && (
                        <a
                          href={getLocalizedHref('/expert')}
                          className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpen(false)
                          }}
                        >
                          {isEditorLike ? <Edit size={16} /> : <Settings size={16} />}
                          {isEditorLike ? t('editorDashboard') : t('expertDashboard')}
                        </a>
                      )}
                      {(isDomainExpert || session.user?.role === 'ADMIN') && (
                        <a
                          href={getLocalizedHref('/dashboard/admin')}
                          className="w-full text-start px-4 py-2 text-sm text-site-text hover:bg-site-card/60 flex items-center gap-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpen(false)
                          }}
                        >
                          <Settings size={16} />
                          {t('adminDashboard')}
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          signOut()
                          setMenuOpen(false)
                        }}
                        className="w-full text-start px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <LogOut size={16} />
                        {t('signOut')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!session && status !== 'loading' && (
            <>
              <div className="w-px h-5 bg-site-border/50 mx-1" />
              <div className="flex items-center gap-1 p-0.5">
                <a
                  href={getLocalizedHref('/auth/signin')}
                  className="px-3 py-1.5 text-xs font-medium text-site-text hover:bg-site-border/30 rounded-full transition-all flex items-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                  }}
                >
                  <LogIn size={14} />
                  {t('signIn')}
                </a>
                <a
                  href={getLocalizedHref('/auth/signup')}
                  className="px-3 py-1.5 text-xs font-bold bg-warm-primary hover:bg-warm-accent text-white rounded-full transition-all shadow-sm active:scale-95"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                  }}
                >
                  {t('signUp')}
                </a>
              </div>
            </>
          )}
        </div>
      </nav>
    </>
  )
}
