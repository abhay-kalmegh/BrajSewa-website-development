'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type WishlistContextValue = { ids: string[]; toggle: (id: string) => void; has: (id: string) => boolean }
const WishlistContext = createContext<WishlistContextValue | null>(null)
const STORAGE_KEY = 'brajsewa-wishlist'

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(stored)) setIds(stored.filter((id): id is string => typeof id === 'string'))
    } catch { /* blocked or malformed storage should not break browsing */ }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* storage is optional */ }
  }, [ids])
  const value = useMemo(() => ({ ids, toggle: (id: string) => setIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]), has: (id: string) => ids.includes(id) }), [ids])
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used within WishlistProvider')
  return context
}
