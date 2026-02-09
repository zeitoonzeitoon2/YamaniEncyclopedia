'use client'

import { Link } from '@/lib/navigation'
import { Header } from '@/components/Header'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, X, Calendar, Video, Award, History, Clock, MessageCircle } from 'lucide-react'
import { AcademyChat } from '@/components/AcademyChat'

type ExamSession = {
  id: string
  status: 'REQUESTED' | 'SCHEDULED' | 'PASSED' | 'FAILED' | 'CANCELED'
  studentId: string
  courseId: string
  scheduledAt: string | null
  meetLink: string | null
  score: number | null
  feedback: string | null
  createdAt: string
  course: { title: string }
  student: { name: string | null; email: string | null }
  examiner?: { name: string | null }
}

export default function AcademyTeachingPage() {
  const t = useTranslations('academy')
  const [exams, setExams] = useState<ExamSession[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'history' | 'communication'>('pending')
  const [editingExam, setEditingExam] = useState<ExamSession | null>(null)
  const [updating, setUpdating] = useState(false)

  // Form states for scheduling/updating
  const [scheduledAt, setScheduledAt] = useState('')
  const [meetLink, setMeetLink] = useState('')
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')

  const fetchExams = async () => {
    if (tab === 'communication') return // Communication handled by AcademyChat
    try {
      setLoading(true)
      const res = await fetch(`/api/academy/exams?type=${tab}`)
      const data = await res.json()
      if (res.ok) {
        setExams(data.exams)
      } else {
        toast.error(data.error || t('loadError'))
      }
    } catch (e) {
      toast.error(t('loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExams()
  }, [tab])

  const openEdit = (exam: ExamSession) => {
    setEditingExam(exam)
    setScheduledAt(exam.scheduledAt ? new Date(exam.scheduledAt).toISOString().slice(0, 16) : '')
    setMeetLink(exam.meetLink || '')
    setScore(exam.score?.toString() || '')
    setFeedback(exam.feedback || '')
  }

  const updateExam = async (payload: {
    status?: ExamSession['status']
    scheduledAt?: string
    meetLink?: string
    score?: number
    feedback?: string
  }) => {
    if (!editingExam) return
    try {
      setUpdating(true)
      const res = await fetch(`/api/academy/exams/${editingExam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(t('updateSuccess'))
        setEditingExam(null)
        fetchExams()
      } else {
        const data = await res.json()
        toast.error(data.error || t('updateError'))
      }
    } catch (e) {
      toast.error(t('updateError'))
    } finally {
      setUpdating(false)
    }
  }

  const saveSchedule = async () => {
    if (!editingExam) return
    const nextStatus = editingExam.status === 'REQUESTED' ? 'SCHEDULED' : undefined
    await updateExam({
      status: nextStatus,
      scheduledAt: scheduledAt || undefined,
      meetLink: meetLink || undefined,
    })
  }

  const saveResult = async (status: ExamSession['status']) => {
    await updateExam({
      status,
      score: score ? parseFloat(score) : undefined,
      feedback: feedback || undefined,
    })
  }

  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">{t('examinerDashboard')}</h1>
            <p className="text-site-muted mt-2">{t('examinerSubtitle')}</p>
          </div>
          <Link href="/academy" className="btn-secondary self-start">
            {t('backToAcademy')}
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-site-border pb-px">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'pending'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock size={16} />
              {t('upcomingSessions')}
            </div>
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'history'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <History size={16} />
              {t('examHistory')}
            </div>
          </button>
          <button
            onClick={() => setTab('communication')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'communication'
                ? 'border-warm-primary text-site-text'
                : 'border-transparent text-site-muted hover:text-site-text'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={16} />
              {t('communicationStudent')}
            </div>
          </button>
        </div>

        {tab === 'communication' ? (
          <AcademyChat role="examiner" />
        ) : loading ? (
          <div className="py-12 text-center text-site-muted">{t('loading')}</div>
        ) : exams.length === 0 ? (
          <div className="card py-12 text-center text-site-muted">
            {tab === 'pending' ? t('noSessions') : t('noHistory')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {exams.map((exam) => (
              <div key={exam.id} className="card hover:border-warm-primary/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        exam.status === 'REQUESTED' ? 'bg-blue-500' :
                        exam.status === 'SCHEDULED' ? 'bg-yellow-500' :
                        exam.status === 'PASSED' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <h3 className="text-lg font-bold text-site-text">{exam.course.title}</h3>
                    </div>
                    <div className="text-sm text-site-muted">
                      {t('studentName')}: <span className="text-site-text">{exam.student.name || exam.student.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2">
                      {exam.scheduledAt && (
                        <div className="flex items-center gap-1.5 text-xs text-site-muted">
                          <Calendar size={14} />
                          {new Date(exam.scheduledAt).toLocaleString()}
                        </div>
                      )}
                      {exam.meetLink && (
                        <a 
                          href={exam.meetLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-warm-primary hover:underline"
                        >
                          <Video size={14} />
                          {t('meetLink')}
                        </a>
                      )}
                      {exam.score !== null && (
                        <div className="flex items-center gap-1.5 text-xs text-green-500 font-bold">
                          <Award size={14} />
                          {t('examScore')}: {exam.score}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {tab === 'pending' ? (
                      <button
                        onClick={() => openEdit(exam)}
                        className="btn-primary py-2 px-4 text-sm"
                      >
                        {exam.status === 'REQUESTED' ? t('approve') : t('updateScore')}
                      </button>
                    ) : (
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                        exam.status === 'PASSED' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {t(`examStatus_${exam.status}`)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {editingExam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="card w-full max-w-lg space-y-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-site-border pb-2">
                <h2 className="text-xl font-bold text-site-text">
                  {editingExam.status === 'REQUESTED' ? t('approve') : t('updateScore')}
                </h2>
                <button onClick={() => setEditingExam(null)} className="text-site-muted hover:text-site-text">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-site-muted">{t('scheduledAt')}</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text outline-none focus:border-warm-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-site-muted">{t('meetLink')}</label>
                    <input
                      type="url"
                      value={meetLink}
                      onChange={(e) => setMeetLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text outline-none focus:border-warm-primary"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-site-border">
                  <button
                    disabled={updating}
                    onClick={saveSchedule}
                    className="btn-primary py-2 px-6 flex-1 flex items-center justify-center gap-2"
                  >
                    <Check size={18} />
                    {t('saveSchedule')}
                  </button>
                  {editingExam.status === 'REQUESTED' && (
                    <button
                      disabled={updating}
                      onClick={() => updateExam({ status: 'CANCELED' })}
                      className="btn-secondary py-2 px-6 flex-1 flex items-center justify-center gap-2"
                    >
                      <X size={18} />
                      {t('reject')}
                    </button>
                  )}
                </div>

                {editingExam.status !== 'REQUESTED' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-site-muted">{t('score')}</label>
                        <input
                          type="number"
                          value={score}
                          onChange={(e) => setScore(e.target.value)}
                          placeholder="0 - 100"
                          className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text outline-none focus:border-warm-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-site-muted">{t('feedback')}</label>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={2}
                          className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text outline-none focus:border-warm-primary resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-site-border">
                      <button
                        disabled={updating}
                        onClick={() => saveResult('PASSED')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex-1 flex items-center justify-center gap-2"
                      >
                        <Award size={18} />
                        {t('pass')}
                      </button>
                      <button
                        disabled={updating}
                        onClick={() => saveResult('FAILED')}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex-1 flex items-center justify-center gap-2"
                      >
                        <X size={18} />
                        {t('fail')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
