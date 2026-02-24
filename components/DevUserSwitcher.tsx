'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession, signOut } from 'next-auth/react'

export function DevUserSwitcher() {
  const { data: session } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Only show in development or if a specific query param is present (for demo/staging)
  // For now, we'll just show it to help the user test.
  // In a real app, you might want: if (process.env.NODE_ENV !== 'development') return null

  const users = 'abcdefghijklmnopqrstuvwxyz'.split('').map(letter => ({
    email: `${letter}@gmail.com`,
    label: letter.toUpperCase(),
    password: `${letter}@gmail.com`
  }))

  const handleSwitch = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      // First sign out if logged in
      if (session) {
        await signOut({ redirect: false })
      }
      
      // Then sign in with new credentials
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      })

      if (result?.ok) {
        window.location.reload()
      } else {
        alert('Login failed')
        setIsLoading(false)
      }
    } catch (error) {
      console.error(error)
      setIsLoading(false)
    }
  }

  if (process.env.NODE_ENV === 'production' && !session?.user?.email?.includes('admin')) {
      // Optional: hide in production for non-admins if desired.
      // return null
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 font-sans pointer-events-none">
      <div className={`transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 mb-4 max-w-sm max-h-[80vh] overflow-y-auto">
          <h3 className="text-sm font-bold mb-3 text-gray-900 dark:text-gray-100 flex justify-between items-center">
            <span>Switch User (Dev Tool)</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </h3>
          
          <div className="grid grid-cols-4 gap-2">
            {users.map((user) => (
              <button
                key={user.email}
                onClick={() => handleSwitch(user.email, user.password)}
                disabled={isLoading || session?.user?.email === user.email}
                className={`
                  p-2 text-xs font-mono rounded border transition-colors
                  ${session?.user?.email === user.email 
                    ? 'bg-blue-600 text-white border-blue-700' 
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}
                `}
                title={user.email}
              >
                {user.label}
              </button>
            ))}
          </div>
          
          {session && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 mb-2">Current: <span className="font-mono">{session.user?.email}</span></p>
              <button 
                onClick={() => signOut()}
                className="w-full py-1 px-3 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-900 hover:bg-gray-800 text-white rounded-full p-3 shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-2 pointer-events-auto"
        title="Quick Switch User"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        {session ? <span className="text-xs font-mono max-w-[60px] truncate">{session.user?.email?.split('@')[0]}</span> : null}
      </button>
    </div>
  )
}
