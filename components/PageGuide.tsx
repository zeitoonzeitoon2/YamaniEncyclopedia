'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from '@/lib/navigation'
import { useTranslations } from 'next-intl'
import { HelpCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function PageGuide() {
  const pathname = usePathname()
  const t = useTranslations('pageGuides')
  const [isOpen, setIsOpen] = useState(false)
  const [pageKey, setPageKey] = useState<string | null>(null)

  useEffect(() => {
    // Determine the page key based on the pathname
    // We remove the locale prefix if it exists, handled by usePathname from navigation lib?
    // usePathname from '@/lib/navigation' returns path without locale prefix usually.
    // Let's assume standardized paths.
    
    let key = null
    const path = pathname || '/'

    if (path.startsWith('/dashboard/admin')) {
        // Check for sub-routes
        if (path.includes('/courses')) {
            key = 'adminCourses'
        } else {
            // Default admin page is domains
            key = 'adminDomains'
        }
    } else if (path.startsWith('/academy')) {
        key = 'academy'
    } else if (path.startsWith('/dashboard')) {
        key = 'dashboard'
    } else if (path === '/') {
        key = 'home'
    }

    // Verify if translation exists for this key
    // This is tricky with next-intl on client side if keys are not loaded.
    // We will assume if key is set, we try to render.
    // However, to avoid showing empty guide, we can check if t(`${key}.title`) returns the key itself or empty.
    // But next-intl might return the key string if missing.
    // A safer way is to rely on a known list or just try.
    
    // For now, let's just set the key if we matched a known route pattern.
    if (key) {
        // Check if content is actually defined in the messages to avoid showing empty help
        // This check is imperfect on client but works if we follow convention.
        setPageKey(key)
    } else {
        setPageKey(null)
    }
  }, [pathname])

  // If no key or no translation found (we can't easily check existence of nested object without try/catch or helper)
  // We'll rely on the user to provide content for the keys we support.
  if (!pageKey) return null

  // Check if title exists to decide whether to show the button
  const title = t(`${pageKey}.title`)
  if (title === `pageGuides.${pageKey}.title`) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-site-muted hover:text-site-text hover:bg-site-secondary/50 rounded-full transition-colors"
        title={t('helpButtonTitle')}
        aria-label={t('helpButtonTitle')}
      >
        <HelpCircle size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[1002] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-site-card border border-site-border rounded-xl shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-site-border">
                <h2 className="text-xl font-bold text-site-text flex items-center gap-2">
                  <HelpCircle size={24} className="text-warm-primary" />
                  {title}
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-site-muted hover:text-red-500 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar text-site-text leading-relaxed space-y-4">
                 {/* Render content paragraphs */}
                 {t.rich(`${pageKey}.content`, {
                    p: (chunks) => <p className="mb-2">{chunks}</p>,
                    ul: (chunks) => <ul className="list-disc list-inside space-y-1 ml-4 mb-2">{chunks}</ul>,
                    li: (chunks) => <li>{chunks}</li>,
                    strong: (chunks) => <strong className="font-bold text-warm-primary">{chunks}</strong>,
                    h3: (chunks) => <h3 className="text-lg font-bold mt-4 mb-2 text-site-text">{chunks}</h3>
                 })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
