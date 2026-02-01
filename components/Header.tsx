'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { User, LogOut, Edit, Settings, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'

export function Header() {
  const { data: session, status } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [displayRole, setDisplayRole] = React.useState<string | undefined>(undefined)
  const [isDomainExpert, setIsDomainExpert] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
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

  const effectiveRole = (displayRole || session?.user?.role) || ''
  const isSupervisorLike = isDomainExpert || ['SUPERVISOR', 'ADMIN'].includes(effectiveRole)
  const isEditorLike = !isSupervisorLike && ['EDITOR', 'USER'].includes(effectiveRole)

  return (
    <header className="bg-site-card border-b border-site-border relative">
      <div className="absolute top-2 right-4 text-xs text-site-muted">
        Tree of Knowledge
      </div>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-site-text heading">
            شجرة العلم
          </Link>

          <nav className="flex items-center gap-4">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-lg hover:bg-site-border transition-colors text-site-text"
                aria-label="تغيير الثيم"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            )}

            {status === 'loading' ? (
              <div className="w-8 h-8 bg-site-border rounded-full animate-pulse"></div>
            ) : session ? (
              <>
                <Link 
                  href="/create" 
                  className="btn-primary flex items-center gap-2"
                >
                  <Edit size={16} />
                  تحرير جديد
                </Link>
                
                {session && (
                  <Link 
                    href="/supervisor" 
                    className="btn-secondary flex items-center gap-2"
                  >
                    {isEditorLike ? <Edit size={16} /> : <Settings size={16} />}
                    {isEditorLike ? 'لوحة المحرر' : 'لوحة المشرف'}
                  </Link>
                )}

                {session.user?.role === 'ADMIN' && (
                  <Link 
                    href="/dashboard/admin" 
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Settings size={16} />
                    لوحة المدير
                  </Link>
                )}

                {/* حذف لوحة المحرر القديمة و ادغام با لوحة المشرف */}

                <div className="flex items-center gap-3">
                  {session.user?.image && (
                    <Link href={`/profile/${session.user.id}`} title="ملفي الشخصي">
                      <Image
                        src={session.user.image}
                        alt={session.user.name || ''}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    </Link>
                  )}
                  <span className="text-site-text">{session.user?.name}</span>
                  <button
                    onClick={() => signOut()}
                    className="text-site-muted hover:text-red-400 transition-colors"
                    title="تسجيل الخروج"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-4">
                <Link href="/auth/signin" className="text-site-text hover:text-warm-primary transition-colors">
                  تسجيل الدخول
                </Link>
                <Link 
                  href="/auth/signup" 
                  className="btn-primary"
                >
                  إنشاء حساب
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
