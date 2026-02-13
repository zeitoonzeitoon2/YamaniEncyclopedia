'use client'

import Image from 'next/image'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Send, User, Calendar, ExternalLink, MessageCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

type Message = {
  id: string
  content: string
  createdAt: string
  sender: {
    id: string
    name: string | null
    image: string | null
  }
}

type ExamSession = {
  id: string
  status: string
  studentId: string
  examinerId: string | null
  scheduledAt: string | null
  meetLink: string | null
  course: { 
    id: string
    title: string
    domain: {
      experts: {
        user: {
          id: string
          name: string | null
          image: string | null
        }
      }[]
      parent?: {
        experts: {
          user: {
            id: string
            name: string | null
            image: string | null
          }
        }[]
      } | null
    }
  }
  student: { id: string, name: string | null; email: string | null; image?: string | null }
  examiner: { id: string, name: string | null; image?: string | null } | null
}

export function AcademyChat({ role = 'student' }: { role?: 'student' | 'examiner' }) {
  const t = useTranslations('academy')
  const isExaminer = role === 'examiner'
  const { data: session } = useSession()
  const [exams, setExams] = useState<ExamSession[]>([])
  const [selectedExam, setSelectedExam] = useState<ExamSession | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loadingExams, setLoadingExams] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchExams = useCallback(async () => {
    try {
      setLoadingExams(true)
      const res = await fetch('/api/academy/exams/my')
      const data = await res.json()
      if (res.ok) {
        setExams(data.exams || [])
        if (data.exams && data.exams.length > 0 && !selectedExam) {
          setSelectedExam(data.exams[0])
        }
      } else {
        console.error('API Error:', data)
        toast.error(data.message || data.error || t('loadError'))
      }
    } catch (error) {
      toast.error(t('loadError'))
    } finally {
      setLoadingExams(false)
    }
  }, [selectedExam, t])

  const fetchMessages = useCallback(async (isFirstLoad = false) => {
    if (!selectedExam) return
    try {
      if (isFirstLoad) setLoadingMessages(true)
      const res = await fetch(`/api/academy/chat?examSessionId=${selectedExam.id}`)
      const data = await res.json()
      if (res.ok) {
        if (data.messages && (data.messages.length > 0 || isFirstLoad)) {
          setMessages(data.messages)
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      if (isFirstLoad) setLoadingMessages(false)
    }
  }, [selectedExam])

  useEffect(() => {
    fetchExams()
  }, [fetchExams])

  useEffect(() => {
    if (selectedExam) {
      fetchMessages(true)
      const interval = setInterval(() => fetchMessages(false), 5000)
      return () => clearInterval(interval)
    }
  }, [selectedExam, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !selectedExam) return

    try {
      const res = await fetch('/api/academy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examSessionId: selectedExam.id,
          content: input,
          studentId: isExaminer ? selectedExam.studentId : undefined // Pass studentId if it's a virtual session from examiner
        })
      })
      const data = await res.json()
      if (res.ok) {
        setMessages([...messages, data.message])
        setInput('')
        
        // If it was a virtual session, we should update the ID to the real one
        if (selectedExam.id.startsWith('course-') && data.message.examSessionId) {
          const updatedExam = { ...selectedExam, id: data.message.examSessionId }
          setSelectedExam(updatedExam)
          setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e))
        }
      } else {
        toast.error(data.error || t('updateError'))
      }
    } catch (error) {
      toast.error(t('updateError'))
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!window.confirm(t('deleteConfirm' as any) || 'Are you sure you want to delete this message?')) return

    try {
      const res = await fetch(`/api/academy/chat?messageId=${messageId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setMessages(messages.filter(m => m.id !== messageId))
        toast.success(t('deleteSuccess' as any) || 'Message deleted')
      } else {
        const data = await res.json()
        toast.error(data.error || t('updateError'))
      }
    } catch (error) {
      toast.error(t('updateError'))
    }
  }

  if (loadingExams) {
    return <div className="py-12 text-center text-site-muted">{t('loading')}</div>
  }

  if (exams.length === 0) {
    return (
      <div className="card text-center py-12">
        <MessageCircle size={48} className="mx-auto text-site-muted mb-4 opacity-20" />
        <p className="text-site-muted">{t('noExams')}</p>
      </div>
    )
  }

  const instructors = selectedExam ? (() => {
    const primary = selectedExam.course.domain.experts || []
    const parent = selectedExam.course.domain.parent?.experts || []
    const merged = [...primary, ...parent]
    const byId = new Map<string, typeof merged[number]>()
    for (const expert of merged) {
      const userId = expert.user?.id
      if (userId && !byId.has(userId)) byId.set(userId, expert)
    }
    return Array.from(byId.values())
  })() : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
      {/* Exam List */}
      <div className="card p-0 flex flex-col overflow-hidden border-gray-700">
        <div className="p-4 border-b border-gray-700 bg-site-card/50 font-bold text-site-text">
          {isExaminer ? t('communicationStudent') : t('examsAndChat')}
        </div>
        <div className="flex-1 overflow-y-auto">
          {exams.map((exam) => (
            <button
              key={exam.id}
              onClick={() => setSelectedExam(exam)}
              className={`w-full text-right p-4 border-b border-gray-800 transition-colors hover:bg-site-card/30 ${
                selectedExam?.id === exam.id ? 'bg-warm-primary/10 border-r-4 border-r-warm-primary' : ''
              }`}
            >
              <div className="font-medium text-site-text">{exam.course.title}</div>
              <div className="text-xs text-site-muted mt-1">
                {isExaminer 
                  ? `${t('studentName')}: ${exam.student?.name || exam.student?.email || '---'}`
                  : `${t('examiner')}: ${exam.examiner?.name || '---'}`
                }
              </div>
              <div className="text-[10px] text-site-muted mt-0.5 italic">
                {t(`examStatus_${exam.status}`)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="lg:col-span-2 card p-0 flex flex-col overflow-hidden border-gray-700">
        {selectedExam ? (
          <>
            {/* Exam Info / Notification */}
            <div className="p-4 border-b border-gray-700 bg-site-card/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-site-text">{selectedExam.course.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-site-muted mt-1">
                    <User size={12} />
                    {isExaminer 
                      ? `${t('studentName')}: ${selectedExam.student?.name || selectedExam.student?.email || '---'}`
                      : `${t('examiner')}: ${selectedExam.examiner?.name || '---'}`
                    }
                  </div>
                </div>
                {selectedExam.status === 'SCHEDULED' && selectedExam.scheduledAt && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-500">
                    <div className="font-bold flex items-center gap-1">
                      <Calendar size={12} />
                      {t('examApprovedMsg')}
                    </div>
                    <div className="mt-1">
                      {t('examScheduledMsg', { date: new Date(selectedExam.scheduledAt).toLocaleString('fa-IR') })}
                    </div>
                    {selectedExam.meetLink && (
                      <a
                        href={selectedExam.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1 text-warm-primary hover:underline"
                      >
                        <ExternalLink size={12} />
                        {t('meetLinkMsg')} {selectedExam.meetLink}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Instructors/Students Section */}
            {!isExaminer && (
              <div className="px-4 py-3 border-b border-gray-700 bg-site-card/30">
                <div className="text-[10px] font-bold text-site-muted mb-2 uppercase tracking-wider">
                  {t('instructors')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {instructors.length > 0 ? (
                    instructors.map((expert) => (
                      <div key={expert.user.id} className="flex items-center gap-2 bg-site-bg/50 rounded-full pr-1 pl-3 py-1 border border-gray-700">
                        {expert.user.image ? (
                          <Image src={expert.user.image} alt={expert.user.name || ''} width={20} height={20} className="rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-warm-primary/20 flex items-center justify-center text-[10px] text-warm-primary">
                            <User size={10} />
                          </div>
                        )}
                        <span className="text-xs text-site-text">{expert.user.name || '---'}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-site-muted italic">{t('noInstructors')}</span>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-site-bg/20">
              {loadingMessages && messages.length === 0 ? (
                <div className="text-center py-4 text-site-muted text-xs">{t('loading')}</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-site-muted text-xs opacity-50">
                  {t('chatPlaceholder')}
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender.id === session?.user?.id
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-start' : 'items-end'} group`}
                    >
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm border shadow-sm relative ${
                        isMe 
                          ? 'bg-warm-primary/10 border-warm-primary/20 text-site-text' 
                          : 'bg-site-card border-gray-700 text-site-text'
                      }`}>
                        <div className="text-[10px] text-site-muted mb-1 flex justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span>{isMe ? t('you' as any) || 'You' : msg.sender.name}</span>
                            {isMe && (
                              <button
                                onClick={() => handleDelete(msg.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500/50 hover:text-red-500 p-0.5"
                                title={t('delete' as any) || 'Delete'}
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                          <span>{new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-gray-700 bg-site-card/50 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chatPlaceholder')}
                className="flex-1 bg-site-bg border border-gray-700 rounded-lg px-4 py-2 text-sm text-site-text focus:outline-none focus:border-warm-primary transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="btn-primary p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-site-muted">
            {t('chatPlaceholder')}
          </div>
        )}
      </div>
    </div>
  )
}
