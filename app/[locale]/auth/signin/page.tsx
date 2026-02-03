'use client'

import { signIn, getSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Link, useRouter } from '@/lib/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'

export default function SignIn() {
  const router = useRouter()
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.push('/')
      }
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast.error(t('invalidCredentials'))
      } else {
        toast.success(t('loginSuccess'))
        router.push('/')
      }
    } catch (error) {
      toast.error(t('loginError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-site-bg flex items-center justify-center">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-site-text mb-2">
            {t('loginTitle')}
          </h1>
          <p className="text-site-muted">
            {t('loginSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-site-text font-medium mb-2">
              {t('email')}
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              placeholder={t('emailPlaceholder')}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-site-text font-medium mb-2">
              {t('password')}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder={t('passwordPlaceholder')}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('loggingIn') : t('loginButton')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-site-muted text-sm">
            {t('noAccount')}{' '}
            <Link href="/auth/signup" className="text-warm-accent hover:text-warm-primary">
              {t('signupLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
