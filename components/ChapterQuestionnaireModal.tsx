'use client'

import { useState, useCallback } from 'react'
import { Modal } from '@/components/Modal'
import { useTranslations } from 'next-intl'
import VotingStatusSummary from '@/components/VotingStatusSummary'
import toast from 'react-hot-toast'
import { FaPlus, FaTrash } from 'react-icons/fa'

type QuestionOption = {
  id?: string
  text: string
  isCorrect: boolean
}

type Question = {
  id: string
  question: string
  status: string
  author: { name: string | null }
  options: QuestionOption[]
  votes: { voterId: string; score: number }[]
  voting?: VotingMetrics
}

type VotingMetrics = {
  eligibleCount: number
  totalRights: number
  votedCount: number
  usedRights?: number
  rightsUsedPercent: number
  totalScore?: number
}

interface ChapterQuestionnaireModalProps {
  isOpen: boolean
  onClose: () => void
  courseId: string
  chapterId: string
  questions: Question[]
  onRefresh: () => void
  onDraftNeeded?: () => Promise<string | null>
}

export default function ChapterQuestionnaireModal({
  isOpen,
  onClose,
  courseId,
  chapterId,
  questions,
  onRefresh,
  onDraftNeeded
}: ChapterQuestionnaireModalProps) {
  const t = useTranslations('adminCourses')
  const [isAdding, setIsAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newOptions, setNewOptions] = useState<QuestionOption[]>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ])
  const [submitting, setSubmitting] = useState(false)

  const handleAddQuestion = useCallback(async () => {
    if (!newQuestion.trim() || newOptions.some(opt => !opt.text.trim())) {
      toast.error(t('questionnaire.fillAllFields'))
      return
    }

    try {
      setSubmitting(true)
      
      let targetChapterId = chapterId
      if (onDraftNeeded) {
        const draftId = await onDraftNeeded()
        if (draftId) targetChapterId = draftId
      }

      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/${targetChapterId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion,
          options: newOptions
        })
      })

      if (res.ok) {
        toast.success(t('questionnaire.saveSuccess'))
        setIsAdding(false)
        setNewQuestion('')
        setNewOptions([
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ])
        onRefresh()
      } else {
        const data = await res.json()
        toast.error(data.error || t('questionnaire.saveError'))
      }
    } catch (error) {
      toast.error(t('questionnaire.networkError'))
    } finally {
      setSubmitting(false)
    }
  }, [newQuestion, newOptions, chapterId, onDraftNeeded, courseId, onRefresh, t])

  const handleDelete = useCallback(async (questionId: string) => {
    if (!confirm(t('questionnaire.deleteConfirm'))) return

    try {
      let targetChapterId = chapterId
      if (onDraftNeeded) {
        const draftId = await onDraftNeeded()
        if (draftId) targetChapterId = draftId
      }

      const res = await fetch(`/api/admin/domains/courses/${courseId}/chapters/${targetChapterId}/questions/${questionId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        onRefresh()
        toast.success(t('questionnaire.deleteSuccess'))
      } else {
        const data = await res.json()
        toast.error(data.error || t('questionnaire.deleteError'))
      }
    } catch (error) {
      toast.error(t('questionnaire.networkError'))
    }
  }, [chapterId, onDraftNeeded, courseId, onRefresh, t])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('questionnaire.title')}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-site-text heading">{t('questionnaire.listTitle')}</h3>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-warm-primary text-white rounded-lg text-sm hover:bg-warm-primary/90 transition-colors"
            >
              <FaPlus size={12} />
              <span>{t('questionnaire.addNew')}</span>
            </button>
          )}
        </div>

        {isAdding && (
          <div className="card border-warm-primary/30 space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-site-muted">{t('questionnaire.questionLabel')}</label>
              <textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="w-full bg-site-bg border border-gray-700 rounded-lg p-3 text-sm text-site-text focus:border-warm-primary outline-none"
                rows={3}
                placeholder={t('questionnaire.questionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newOptions.map((opt, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-site-muted">{t('questionnaire.optionLabel', { number: idx + 1 })}</label>
                    <button
                      onClick={() => {
                        const next = [...newOptions]
                        next.forEach((o, i) => o.isCorrect = i === idx)
                        setNewOptions(next)
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded ${opt.isCorrect ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                    >
                      {opt.isCorrect ? t('questionnaire.correctAnswer') : t('questionnaire.markAsCorrect')}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const next = [...newOptions]
                      next[idx].text = e.target.value
                      setNewOptions(next)
                    }}
                    className="w-full bg-site-bg border border-gray-700 rounded-lg p-2 text-sm text-site-text focus:border-warm-primary outline-none"
                    placeholder={t('questionnaire.optionPlaceholder', { number: idx + 1 })}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-sm text-site-muted hover:text-site-text"
              >
                {t('questionnaire.cancel')}
              </button>
              <button
                onClick={handleAddQuestion}
                disabled={submitting}
                className="px-4 py-2 bg-warm-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {submitting ? t('questionnaire.submitting') : t('questionnaire.submit')}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {questions.length === 0 ? (
            <div className="text-center py-10 text-site-muted">{t('questionnaire.noQuestions')}</div>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="card border-gray-800 hover:border-gray-700 transition-colors">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        q.status === 'APPROVED' ? 'bg-green-600/20 text-green-400' :
                        q.status === 'REJECTED' ? 'bg-red-600/20 text-red-400' :
                        'bg-yellow-600/20 text-yellow-400'
                      }`}>
                        {q.status === 'APPROVED' ? t('statusApproved') : q.status === 'REJECTED' ? t('statusRejected') : t('statusDraft')}
                      </span>
                      <span className="text-[10px] text-site-muted">{t('questionnaire.by', { name: q.author.name || t('questionnaire.unknown') })}</span>
                    </div>
                    <p className="text-sm font-medium text-site-text">{q.question}</p>
                    {q.voting && (
                      <VotingStatusSummary
                        eligibleCount={q.voting.eligibleCount}
                        totalRights={q.voting.totalRights}
                        votedCount={q.voting.votedCount}
                        usedRights={q.voting.usedRights}
                        rightsUsedPercent={q.voting.rightsUsedPercent}
                        totalScore={q.voting.totalScore}
                      />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {q.options.map((opt, idx) => (
                        <div key={idx} className={`text-xs p-2 rounded border ${opt.isCorrect ? 'border-green-600/50 bg-green-600/10 text-green-200' : 'border-gray-800 bg-site-bg text-site-muted'}`}>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="p-2 bg-gray-800 text-gray-400 hover:bg-red-600/20 hover:text-red-500 rounded transition-colors"
                      title={t('questionnaire.delete')}
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
