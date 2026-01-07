'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import toast from 'react-hot-toast'
import Image from 'next/image'
import Link from 'next/link'

interface User {
  id: string
  name: string | null
  email: string | null
  role: string
  createdAt: string
  _count: {
    posts: number
    comments: number
    adminVotes: number
  }
}

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [headerUrl, setHeaderUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    
    if (!session) {
      router.push('/')
      return
    }

    if (session.user?.role !== 'ADMIN') {
      toast.error('ليست لديك صلاحية المدير')
      router.push('/')
      return
    }

    fetchUsers()
    fetchHeader()
  }, [session, status, router])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        toast.error('خطا در بارگذاری کاربران')
      }
    } catch (error) {
      console.error('Fetch error:', error)
      toast.error('خطا در بارگذاری اطلاعات')
    } finally {
      setLoading(false)
    }
  }

  const fetchHeader = async () => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await res.json()
      setHeaderUrl(data.url || null)
    } catch (e) {
      console.error(e)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('يرجى اختيار ملف أولاً')
      return
    }
    try {
      setUploading(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await fetch('/api/admin/settings', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'فشل الرفع')
      }
      const data = await res.json()
      setHeaderUrl(data.url)
      setPreviewUrl(null)
      setSelectedFile(null)
      toast.success('تم تحديث صورة الترويسة بنجاح')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'خطا در آپلود')
    } finally {
      setUploading(false)
    }
  }

  const updateUserRole = async (userId: string, newRole: string) => {
    if (userId === session?.user?.id) {
      toast.error('لا يمكنك تغيير دورك')
      return
    }

    setUpdatingRole(userId)
    try {
      const response = await fetch('/api/admin/users/role', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role: newRole }),
      })

      if (response.ok) {
        toast.success('تم تغيير دور المستخدم بنجاح')
        fetchUsers() // بروزرسانی لیست
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'خطأ في تغيير الدور')
      }
    } catch (error) {
      console.error('Update role error:', error)
      toast.error('خطأ في تغيير دور المستخدم')
    } finally {
      setUpdatingRole(null)
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'مدير'
      case 'SUPERVISOR': return 'مشرف'
      case 'EDITOR': return 'محرر'
      case 'USER': return 'مستخدم'
      default: return role
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800'
      case 'SUPERVISOR': return 'bg-purple-100 text-purple-800'
      case 'EDITOR': return 'bg-blue-100 text-blue-800'
      case 'USER': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text">جارٍ التحميل...</div>
      </div>
    )
  }

  const adminCount = users.filter(u => u.role === 'ADMIN').length
  const supervisorCount = users.filter(u => u.role === 'SUPERVISOR').length
  const editorCount = users.filter(u => u.role === 'EDITOR').length

  return (
    <div className="min-h-screen bg-dark-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-dark-text mb-8 text-center heading">
          لوحة إدارة المستخدمين
        </h1>

        <div className="card mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-dark-text heading">لوحة المدير</h2>
              <p className="text-dark-muted text-sm mt-1">إدارة القلمروهات وتعيين الخبراء</p>
            </div>
            <Link href="/dashboard/admin/domains" className="btn-primary">
              مدیریت قلمروها
            </Link>
          </div>
        </div>

        {/* Site Settings: Header image */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-dark-text mb-4 heading">إعدادات الموقع - صورة الترويسة</h2>
          <p className="text-dark-muted text-sm mb-3">المقاس المقترح: 1920×480 (نسبة 4:1)، الحد الأقصى للحجم 5 ميجابايت، الصيغ: JPG/PNG/WebP</p>
          {headerUrl && (
            <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4">
              <Image src={headerUrl} alt="Header" fill className="object-cover rounded-lg" unoptimized />
            </div>
          )}
          {previewUrl && (
            <div className="relative w-full h-40 md:h-56 lg:h-64 mb-4 ring-2 ring-warm-accent rounded-lg overflow-hidden">
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <input type="file" accept="image/*" onChange={handleFileChange} className="text-dark-text" />
            <button onClick={handleUpload} disabled={uploading || !selectedFile} className="px-4 py-2 bg-warm-primary text-black rounded disabled:opacity-50">
              {uploading ? 'جارٍ الرفع...' : 'رفع صورة الترويسة'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">إجمالي المستخدمين</h3>
            <p className="text-2xl font-bold text-warm-primary">{users.length}</p>
          </div>
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">المشرفون</h3>
            <p className="text-2xl font-bold text-purple-400">{supervisorCount}</p>
          </div>
          <div className="card text-center">
            <h3 className="text-lg font-semibold text-dark-text heading">المحررون</h3>
            <p className="text-2xl font-bold text-blue-400">{editorCount}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="card">
          <h2 className="text-xl font-bold text-dark-text mb-6 heading">قائمة المستخدمين</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-right py-3 px-4 text-dark-text font-semibold">الاسم</th>
                  <th className="text-right py-3 px-4 text-dark-text font-semibold">البريد</th>
                  <th className="text-right py-3 px-4 text-dark-text font-semibold">الدور الحالي</th>
                  <th className="text-right py-3 px-4 text-dark-text font-semibold">النشاط</th>
                  <th className="text-right py-3 px-4 text-dark-text font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-dark-border hover:bg-dark-card/50">
                    <td className="py-4 px-4 text-dark-text">
                      {user.name || 'بدون اسم'}
                      {user.id === session?.user?.id && (
                        <span className="text-warm-accent text-sm mr-2">(أنت)</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-dark-text">{user.email}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(user.role)}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-dark-text text-sm">
                      <div className="flex gap-4 text-xs">
                        <span>پست‌ها: {user._count.posts}</span>
                        <span>کامنت‌ها: {user._count.comments}</span>
                        <span>رای‌ها: {user._count.adminVotes}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {user.id === session?.user?.id ? (
                        <span className="text-sm text-gray-500">نفسك</span>
                      ) : (
                        <div className="flex gap-2">
                          {user.role !== 'SUPERVISOR' && (
                            <button
                              onClick={() => updateUserRole(user.id, 'SUPERVISOR')}
                              disabled={updatingRole === user.id}
                              className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
                            >
                              {updatingRole === user.id ? '...' : 'مشرف'}
                            </button>
                          )}
                          {user.role !== 'EDITOR' && (
                            <button
                              onClick={() => updateUserRole(user.id, 'EDITOR')}
                              disabled={updatingRole === user.id}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {updatingRole === user.id ? '...' : 'محرر'}
                            </button>
                          )}
                          {/* Removed USER role option */}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
