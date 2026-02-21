'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

type QuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type ChapterQuestion = {
  id: string
  question: string
  options: QuestionOption[]
}

interface StudentChapterQuizProps {
  courseId: string
  chapterId: string
}

export default function StudentChapterQuiz({ courseId, chapterId }: StudentChapterQuizProps) {
  const [questions, setQuestions] = useState<ChapterQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [showResults, setShowResults] = useState(false)

  const fetchQuiz = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/academy/course/${courseId}/chapters/${chapterId}/quiz`)
      const data = await res.json()
      if (res.ok) {
        setQuestions(data.questions || [])
      }
    } catch (error) {
      console.error('Error fetching quiz:', error)
    } finally {
      setLoading(false)
    }
  }, [courseId, chapterId])

  useEffect(() => {
    fetchQuiz()
    setUserAnswers({})
    setShowResults(false)
  }, [fetchQuiz])

  if (loading) return <div className="text-site-muted text-sm p-4 text-center">در حال بارگذاری پرسشنامه...</div>
  if (questions.length === 0) return null

  const handleAnswer = (questionId: string, optionId: string) => {
    if (showResults) return
    setUserAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const handleSubmit = () => {
    if (Object.keys(userAnswers).length < questions.length) {
      toast.error('لطفاً به تمام سوالات پاسخ دهید')
      return
    }
    setShowResults(true)
  }

  const score = questions.reduce((acc, q) => {
    const userAnswerId = userAnswers[q.id]
    const correctOption = q.options.find((o) => o.isCorrect)
    return userAnswerId === correctOption?.id ? acc + 1 : acc
  }, 0)

  return (
    <div className="card space-y-4 mt-6 border-warm-primary/30">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-site-text heading">خودارزیابی فصل</h3>
        {showResults && (
          <span className="text-sm font-bold text-warm-primary">
            امتیاز شما: {score} از {questions.length}
          </span>
        )}
      </div>
      
      <div className="space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-3">
            <p className="text-site-text text-sm font-medium">
              {idx + 1}. {q.question}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {q.options.map((opt) => {
                const isSelected = userAnswers[q.id] === opt.id
                const isCorrect = opt.isCorrect
                let bgColor = 'bg-site-card/40 border-gray-700'
                let textColor = 'text-site-muted'

                if (showResults) {
                  if (isCorrect) {
                    bgColor = 'bg-green-600/20 border-green-600/50'
                    textColor = 'text-green-200'
                  } else if (isSelected && !isCorrect) {
                    bgColor = 'bg-red-600/20 border-red-600/50'
                    textColor = 'text-red-200'
                  }
                } else if (isSelected) {
                  bgColor = 'bg-warm-primary/20 border-warm-primary'
                  textColor = 'text-site-text'
                }

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleAnswer(q.id, opt.id)}
                    disabled={showResults}
                    className={`text-right p-3 rounded-lg border text-sm transition-all ${bgColor} ${textColor} ${!showResults && 'hover:border-gray-600'}`}
                  >
                    {opt.text}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {!showResults ? (
        <button
          onClick={handleSubmit}
          className="btn-primary w-full text-sm mt-4"
        >
          مشاهده نتایج
        </button>
      ) : (
        <button
          onClick={() => {
            setShowResults(false)
            setUserAnswers({})
          }}
          className="btn-secondary w-full text-sm mt-4"
        >
          تلاش مجدد
        </button>
      )}
      <p className="text-[10px] text-site-muted text-center mt-2">
        این پرسشنامه صرفاً برای خودارزیابی شماست و تاثیری در نمره نهایی ندارد.
      </p>
    </div>
  )
}
