import Link from 'next/link'
import { Header } from '@/components/Header'

export default function AcademyDashboardPage() {
  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">لوحة المتعلم</h1>
            <p className="text-site-muted mt-2">تتبع الدورات والاختبارات الخاصة بك.</p>
          </div>
          <Link href="/academy" className="btn-secondary">
            العودة للأكاديمية
          </Link>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-site-text heading mb-3">دوراتي</h2>
          <div className="text-site-muted">لا توجد دورات مسجلة بعد.</div>
        </div>
      </main>
    </div>
  )
}
