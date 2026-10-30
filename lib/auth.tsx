'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSession, logout } from '@/lib/api/client'
import type { Profile } from '@/lib/types'

type AuthContextValue = {
  user: Profile | null
  /** 'loading' until the first session check finishes, so pages don't flash a signed-out state. */
  status: 'loading' | 'ready'
  /** Re-check the session (call after login/register). */
  refresh: () => Promise<Profile | null>
  /** Sign out on the server (revokes the refresh token) and locally. */
  signOut: () => Promise<void>
  /** Mark the session as ended, e.g. after the API answered 401. */
  markSignedOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await getSession()
      setUser(current)
      return current
    } catch {
      return null // upstream hiccup: keep the previous state rather than signing the visitor out
    } finally {
      setStatus('ready')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signOut = useCallback(async () => {
    try { await logout() } finally { setUser(null) }
  }, [])

  const markSignedOut = useCallback(() => setUser(null), [])

  const value = useMemo(() => ({ user, status, refresh, signOut, markSignedOut }), [user, status, refresh, signOut, markSignedOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** For pages that need a signed-in customer: sends guests to /login and back again afterwards. */
export function useRequireAuth() {
  const auth = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (auth.status === 'ready' && !auth.user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [auth.status, auth.user, router, pathname])
  return auth
}
