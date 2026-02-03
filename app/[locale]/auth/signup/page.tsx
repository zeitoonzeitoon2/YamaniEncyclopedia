'use client'

import { useState } from 'react'
import { Link, useRouter } from '@/lib/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'

export default function SignUp() {
  const router = useRouter()
  const t = useTranslations('auth')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast.error(t('passwordMismatch'))
      return
    }

    if (formData.password.length < 6) {
      toast.error(t('passwordTooShort'))
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(t('signupSuccess'))
        router.push('/auth/signin')
      } else {
        toast.error(data.message || t('signupError'))
      }
    } catch (error) {
      toast.error(t('signupError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-site-bg flex items-center justify-center">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-site-text mb-2">
            {t('signupTitle')}
          </h1>
          <p className="text-site-muted">
            {t('signupSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-site-text font-medium mb-2">
              {t('name')}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input w-full"
              placeholder={t('namePlaceholder')}
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-site-text font-medium mb-2">
              {t('email')}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
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
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="input w-full"
              placeholder={t('passwordHint')}
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-site-text font-medium mb-2">
              {t('confirmPassword')}
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input w-full"
              placeholder={t('confirmPasswordPlaceholder')}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('registering') : t('signupButton')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-site-muted text-sm">
            {t('hasAccount')}{' '}
            <Link href="/auth/signin" className="text-warm-accent hover:text-warm-primary">
              {t('loginLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
