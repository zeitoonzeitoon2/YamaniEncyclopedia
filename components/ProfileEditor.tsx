'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'

interface Props {
  initialName?: string | null
  initialBio?: string | null
  initialImage?: string | null
}

export default function ProfileEditor({ initialName, initialBio, initialImage }: Props) {
  const t = useTranslations('profileEditor')
  const [name, setName] = useState(initialName || '')
  const [bio, setBio] = useState(initialBio || '')
  const [image, setImage] = useState(initialImage || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio, image }),
      })
      if (res.ok) {
        toast.success(t('profileUpdated'))
      } else {
        const text = await res.text()
        let err: any = {}
        try { err = JSON.parse(text) } catch { err = { error: text } }
        toast.error(err?.error || t('updateFailed'))
      }
    } catch (e) {
      console.error('Failed to save profile', e)
      toast.error(t('updateError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
      if (res.ok) {
        const j = await res.json()
        setImage(j.image || image)
        toast.success(t('uploadSuccess'))
      } else {
        const text = await res.text()
        let err: any = {}
        try { err = JSON.parse(text) } catch { err = { error: text } }
        toast.error(err?.error || t('uploadFailed'))
      }
    } catch (e) {
      console.error('Upload error', e)
      toast.error(t('uploadError'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-site-text heading mb-3">{t('editProfile')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-site-muted mb-1">{t('name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 rounded border border-gray-700 bg-site-bg text-site-text" />
        </div>
        <div>
          <label className="block text-sm text-site-muted mb-1">{t('bio')}</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="w-full p-2 rounded border border-gray-700 bg-site-bg text-site-text" />
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-sm text-site-muted mb-1">{t('uploadAvatar')}</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files && e.target.files[0] && handleUpload(e.target.files[0])} />
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={handleSave} disabled={isSaving || isUploading} className="btn-primary disabled:opacity-50">{t('save')}</button>
      </div>
    </div>
  )
}