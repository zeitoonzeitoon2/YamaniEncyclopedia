'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'react-hot-toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        {children}
        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--site-card)',
              color: 'var(--site-text)',
              border: '1px solid var(--site-border)',
            },
          }}
        />
      </ThemeProvider>
    </SessionProvider>
  )
}