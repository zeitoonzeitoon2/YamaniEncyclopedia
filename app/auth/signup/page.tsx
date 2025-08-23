'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function SignUp() {
  const router = useRouter()
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
      toast.error('رمز عبور و تکرار آن یکسان نیستند')
      return
    }

    if (formData.password.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد')
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
        toast.success('حساب شما با موفقیت ایجاد شد')
        router.push('/auth/signin')
      } else {
        toast.error(data.message || 'خطا در ایجاد حساب')
      }
    } catch (error) {
      toast.error('خطا در ایجاد حساب')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-dark-text mb-2">
            ایجاد حساب جدید
          </h1>
          <p className="text-dark-muted">
            اطلاعات خود را برای ثبت نام وارد کنید
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-dark-text font-medium mb-2">
              نام
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input w-full"
              placeholder="نام خود را وارد کنید"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-dark-text font-medium mb-2">
              ایمیل
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input w-full"
              placeholder="example@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-dark-text font-medium mb-2">
              رمز عبور
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="input w-full"
              placeholder="حداقل ۶ کاراکتر"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-dark-text font-medium mb-2">
              تکرار رمز عبور
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input w-full"
              placeholder="رمز عبور را دوباره وارد کنید"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'در حال ایجاد حساب...' : 'ثبت نام'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-dark-muted text-sm">
            قبلاً حساب دارید؟{' '}
            <Link href="/auth/signin" className="text-warm-accent hover:text-warm-primary">
              وارد شوید
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}