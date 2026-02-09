'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

type Prerequisite = {
  id: string
  courseId: string
  prerequisiteCourseId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  proposer: { name: string | null }
  prerequisiteCourse: { id: string; title: string }
  _count: { votes: number }
}

type Course = {
  id: string
  title: string
}

export default function CoursePrerequisitesManager({ courseId }: { courseId: string }) {
  const t = useTranslations('adminCourses.prerequisites')
  const { data: session } = useSession()
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([])
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [votingKey, setVotingKey] = useState<string | null>(null)

  const fetchPrerequisites = async () => {
    try {
      const res = await fetch(`/api/admin/domains/courses/${courseId}/prerequisites`)
      const data = await res.json()
      if (res.ok) {
        setPrerequisites(data.prerequisites)
      }
    } catch (error) {
      console.error('Error fetching prerequisites:', error)
    }
  }

  const fetchAllCourses = async () => {
    try {
      const res = await fetch('/api/academy/courses')
      const data = await res.json()
      if (res.ok && Array.isArray(data.domains)) {
        const flatCourses = data.domains.flatMap((d: any) => d.courses || [])
        setAllCourses(flatCourses.filter((c: Course) => c.id !== courseId))
      }
    } catch (error) {
      console.error('Error fetching courses:', error)
    }
  }

  useEffect(() => {
    if (courseId) {
      Promise.all([fetchPrerequisites(), fetchAllCourses()]).finally(() => setLoading(false))
    }
  }, [courseId])

  const handlePropose = async () => {
    if (!selectedCourseId) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/admin/domains/courses/${courseId}/prerequisites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteCourseId: selectedCourseId })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(t('toast.proposed'))
        setSelectedCourseId('')
        fetchPrerequisites()
      } else {
        toast.error(data.error || t('toast.error'))
      }
    } catch (error) {
      toast.error(t('toast.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVote = async (prerequisiteId: string, vote: 'APPROVE' | 'REJECT') => {
    try {
      setVotingKey(`${prerequisiteId}:${vote}`)
      const res = await fetch(`/api/admin/domains/courses/${courseId}/prerequisites/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteId, vote })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(t('toast.voted'))
        fetchPrerequisites()
      } else {
        toast.error(data.error || t('toast.error'))
      }
    } catch (error) {
      toast.error(t('toast.error'))
    } finally {
      setVotingKey(null)
    }
  }

  if (loading) return <div className="p-4 text-site-muted">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="bg-site-card/40 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-bold text-site-text mb-4 heading">{t('proposeTitle')}</h3>
        <div className="flex gap-3">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="flex-1 bg-site-bg border border-gray-700 rounded-lg px-3 py-2 text-site-text focus:ring-2 focus:ring-warm-primary outline-none"
          >
            <option value="">{t('selectCourse')}</option>
            {allCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button
            onClick={handlePropose}
            disabled={submitting || !selectedCourseId}
            className="btn-primary"
          >
            {submitting ? '...' : t('proposeBtn')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-bold text-site-text heading">{t('listTitle')}</h3>
        {prerequisites.length === 0 ? (
          <p className="text-site-muted text-sm">{t('noPrerequisites')}</p>
        ) : (
          <div className="grid gap-3">
            {prerequisites.map((p) => (
              <div key={p.id} className="bg-site-card/40 border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="text-site-text font-medium">{p.prerequisiteCourse.title}</div>
                  <div className="text-xs text-site-muted mt-1">
                    {t('proposedBy')}: {p.proposer.name || 'Unknown'} • 
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
                      p.status === 'APPROVED' ? 'bg-green-500/10 text-green-400' :
                      p.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {t(`status.${p.status}`)}
                    </span>
                  </div>
                </div>

                {p.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVote(p.id, 'APPROVE')}
                      disabled={!!votingKey}
                      className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors text-xs flex items-center gap-1"
                    >
                      {votingKey === `${p.id}:APPROVE` ? '...' : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          {t('approve')}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleVote(p.id, 'REJECT')}
                      disabled={!!votingKey}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-xs flex items-center gap-1"
                    >
                      {votingKey === `${p.id}:REJECT` ? '...' : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          {t('reject')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
