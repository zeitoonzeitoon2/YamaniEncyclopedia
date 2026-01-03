'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { User, LogOut, Edit, Settings } from 'lucide-react'

export function Header() {
  const { data: session, status } = useSession()

  return (
    <header className="bg-dark-card border-b border-dark-border relative">
      <div className="absolute top-2 right-4 text-xs text-dark-muted">
        Tree of Knowledge
      </div>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-dark-text heading">
            شجرة العلم
          </Link>

          <nav className="flex items-center gap-4">
            {status === 'loading' ? (
              <div className="w-8 h-8 bg-dark-border rounded-full animate-pulse"></div>
            ) : session ? (
              <>
                <Link 
                  href="/create" 
                  className="btn-primary flex items-center gap-2"
                >
                  <Edit size={16} />
                  تحرير جديد
                </Link>
                
                {(session?.user?.role === 'EDITOR' || session?.user?.role === 'SUPERVISOR' || session?.user?.role === 'ADMIN') && (
                  <Link 
                    href="/supervisor" 
                    className="btn-primary flex items-center gap-2"
                  >
                    {session.user?.role === 'EDITOR' ? <Edit size={16} /> : <Settings size={16} />}
                    {session.user?.role === 'EDITOR' ? 'لوحة المحرر' : 'لوحة المشرف'}
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
                  <span className="text-dark-text">{session.user?.name}</span>
                  <button
                    onClick={() => signOut()}
                    className="text-dark-muted hover:text-red-400 transition-colors"
                    title="تسجيل الخروج"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="btn-primary flex items-center gap-2"
              >
                <User size={16} />
                تسجيل الدخول
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}