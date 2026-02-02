'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Header } from '@/components/Header'

type AcademyCourse = {
  id: string
  title: string
  description: string | null
}

type AcademyDomain = {
  id: string
  name: string
  slug: string
  description: string | null
  courses: AcademyCourse[]
}

export default function AcademyLandingPage() {
  const [domains, setDomains] = useState<AcademyDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [enrollingId, setEnrollingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/academy/courses', { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as { domains?: AcademyDomain[]; error?: string }
        if (!res.ok) {
          toast.error(payload.error || 'خطأ في جلب الدورات')
          return
        }
        setDomains(Array.isArray(payload.domains) ? payload.domains : [])
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'خطأ في جلب الدورات'
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const enroll = async (courseId: string) => {
    try {
      setEnrollingId(courseId)
      const res = await fetch('/api/academy/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error || 'تعذر التسجيل')
        return
      }
      toast.success('تم التسجيل بنجاح')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر التسجيل'
      toast.error(msg)
    } finally {
      setEnrollingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">الأكاديمية</h1>
            <p className="text-site-muted mt-2">
              منصّة التعليم والاختبارات للوصول إلى الامتيازات داخل شجرة البحث.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/academy/dashboard" className="btn-primary">
              لوحة المتعلم
            </Link>
            <Link href="/academy/teaching" className="btn-secondary">
              لوحة الممتحن
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-site-muted">جارٍ التحميل...</div>
        ) : domains.length === 0 ? (
          <div className="text-site-muted">لا توجد دورات معتمدة بعد.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {domains.map((domain) => (
              <div key={domain.id} id={`domain-${domain.slug}`} className="card">
                <h2 className="text-xl font-bold text-site-text heading mb-2">{domain.name}</h2>
                {domain.description && <div className="text-site-muted text-sm mb-3">{domain.description}</div>}
                <div className="space-y-3">
                  {domain.courses.map((course) => (
                    <div key={course.id} className="p-3 rounded-lg border border-gray-700 bg-site-card/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-site-text font-medium">{course.title}</div>
                          {course.description && <div className="text-xs text-site-muted mt-1">{course.description}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => enroll(course.id)}
                          disabled={enrollingId === course.id}
                          className="btn-primary text-sm disabled:opacity-50"
                        >
                          {enrollingId === course.id ? '...' : 'تسجيل'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
