'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

type Prerequisite = {
  id: string
  courseId: string
  prerequisiteCourseId: string
  type: 'STUDY' | 'TEACH'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  proposer: { name: string | null }
  prerequisiteCourse?: { id: string; title: string }
  course?: { id: string; title: string }
  _count?: { votes: number }
}

type Course = {
  id: string
  title: string
}

export default function CoursePrerequisitesManager({ courseId }: { courseId: string }) {
  const t = useTranslations('adminCourses.prerequisites')
  const { data: session } = useSession()
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([])
  const [dependents, setDependents] = useState<Prerequisite[]>([])
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedType, setSelectedType] = useState<'STUDY' | 'TEACH'>('STUDY')
  const [votingKey, setVotingKey] = useState<string | null>(null)

  const fetchPrerequisites = async () => {
    try {
      const res = await fetch(`/api/admin/domains/courses/${courseId}/prerequisites`)
      const data = await res.json()
      if (res.ok) {
        setPrerequisites(data.prerequisites || [])
        setDependents(data.dependents || [])
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
        body: JSON.stringify({ 
          prerequisiteCourseId: selectedCourseId,
          type: selectedType
        })
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

  const studyPrereqs = prerequisites.filter(p => p.type === 'STUDY')
  const teachPrereqs = prerequisites.filter(p => p.type === 'TEACH')

  const PrerequisiteCard = ({ p, showCourse = false }: { p: Prerequisite, showCourse?: boolean }) => (
    <div key={p.id} className="bg-site-card/40 border border-gray-700 rounded-lg p-3 flex flex-col justify-between items-start gap-2">
      <div className="w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="text-site-text font-medium text-sm">
            {showCourse ? p.course?.title : p.prerequisiteCourse?.title}
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            p.type === 'TEACH' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          }`}>
            {t(`types.${p.type}`)}
          </span>
        </div>
        <div className="text-[10px] text-site-muted mt-1 flex items-center justify-between">
          <span>{t('proposedBy')}: {p.proposer.name || 'Unknown'}</span>
          <span className={`px-2 py-0.5 rounded-full ${
            p.status === 'APPROVED' ? 'bg-green-500/10 text-green-400' :
            p.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' :
            'bg-yellow-500/10 text-yellow-400'
          }`}>
            {t(`status.${p.status}`)}
          </span>
        </div>
      </div>

      {!showCourse && p.status === 'PENDING' && (
        <div className="flex gap-2 w-full mt-1">
          <button
            onClick={() => handleVote(p.id, 'APPROVE')}
            disabled={!!votingKey}
            className="flex-1 px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors text-[10px] flex items-center justify-center gap-1"
          >
            {votingKey === `${p.id}:APPROVE` ? '...' : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                {t('approve')}
              </>
            )}
          </button>
          <button
            onClick={() => handleVote(p.id, 'REJECT')}
            disabled={!!votingKey}
            className="flex-1 px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-[10px] flex items-center justify-center gap-1"
          >
            {votingKey === `${p.id}:REJECT` ? '...' : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                {t('reject')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="bg-site-card/40 border border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-bold text-site-text mb-4 heading">{t('proposeTitle')}</h3>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
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
          <div className="flex flex-wrap items-center gap-4 text-sm text-site-text">
            <span className="text-site-muted">{t('typeLabel')}</span>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="prereqType"
                value="STUDY"
                checked={selectedType === 'STUDY'}
                onChange={() => setSelectedType('STUDY')}
                className="accent-warm-primary w-4 h-4"
              />
              <span className={selectedType === 'STUDY' ? 'text-warm-primary font-medium' : 'text-site-muted group-hover:text-site-text'}>
                {t('studyType')}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="prereqType"
                value="TEACH"
                checked={selectedType === 'TEACH'}
                onChange={() => setSelectedType('TEACH')}
                className="accent-warm-primary w-4 h-4"
              />
              <span className={selectedType === 'TEACH' ? 'text-warm-primary font-medium' : 'text-site-muted group-hover:text-site-text'}>
                {t('teachType')}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Right Column: Prerequisites for THIS course */}
        <div className="space-y-8">
          <h3 className="text-xl font-bold text-site-text heading border-b border-gray-800 pb-2">
            {t('thisCoursePrerequisites')}
          </h3>
          
          {/* Top Right: Study Prerequisites */}
          <div className="space-y-4">
            <h4 className="text-md font-bold text-blue-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
              {t('studyPrerequisites')}
            </h4>
            {studyPrereqs.length === 0 ? (
              <p className="text-site-muted text-sm italic">{t('noPrerequisites')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {studyPrereqs.map((p) => <PrerequisiteCard p={p} key={p.id} />)}
              </div>
            )}
          </div>

          {/* Bottom Right: Teach Prerequisites */}
          <div className="space-y-4">
            <h4 className="text-md font-bold text-purple-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              {t('teachPrerequisites')}
            </h4>
            {teachPrereqs.length === 0 ? (
              <p className="text-site-muted text-sm italic">{t('noPrerequisites')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teachPrereqs.map((p) => <PrerequisiteCard p={p} key={p.id} />)}
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Other courses that depend on this one */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-site-text heading border-b border-gray-800 pb-2">
            {t('otherCoursesDependencies')}
          </h3>
          <p className="text-xs text-site-muted mb-4 bg-site-bg/50 p-2 rounded border border-gray-800 italic">
            {t('dependencyNote')}
          </p>
          
          {dependents.length === 0 ? (
            <p className="text-site-muted text-sm italic">{t('noDependencies')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dependents.map((p) => <PrerequisiteCard p={p} key={p.id} showCourse={true} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
