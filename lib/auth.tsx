'use client'

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { getSession, login as loginRequest, logout as logoutRequest } from '@/lib/api/client'
import type { Profile } from '@/lib/types'

type AuthContextValue = {
  user: Profile | null
  loading: boolean
  /** 'error' preserves the protected page during a backend outage instead of treating it as a signed-out session. */
  status: 'loading' | 'ready' | 'error'
  login: (credentials: { email: string; password: string }) => Promise<Profile | null>
  logout: () => Promise<void>
  /** Re-check the session (call after login/register). */
  refresh: () => Promise<Profile | null>
  /** Sign out on the server (revokes the refresh token) and locally. */
  signOut: () => Promise<void>
  /** Mark the session as ended, e.g. after the API answered 401. */
  markSignedOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, error, isLoading, mutate } = useSWR('auth-session', getSession, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const user = session?.user ?? null
  const status: AuthContextValue['status'] = isLoading ? 'loading' : error ? 'error' : 'ready'

  const refresh = useCallback(async () => {
    try {
      const nextSession = await mutate(getSession(), { revalidate: false })
      return nextSession?.user ?? null
    } catch {
      return null
    }
  }, [mutate])

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    await loginRequest(credentials)
    return refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      await mutate({ user: null }, { revalidate: false })
    }
  }, [mutate])

  const markSignedOut = useCallback(() => { void mutate({ user: null }, { revalidate: false }) }, [mutate])

  const value = useMemo(() => ({ user, loading: status === 'loading', status, login, logout: signOut, refresh, signOut, markSignedOut }), [user, status, login, refresh, signOut, markSignedOut])
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
