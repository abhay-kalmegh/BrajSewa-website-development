'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, mergeCart, quoteCart, saveCart, type CartLineInput } from '@/lib/api/client'
import { useAuth } from '@/lib/auth'
import {
  MAX_QUANTITY, STORAGE_KEY, SYNC_DELAY_MS, cartInputFrom, clampQuantity, itemFromQuoteLine, lineKeyFor, parseStoredCart,
  reconcile, signatureOf, toLines, type CartInput, type CartProduct, type CartSummary,
} from '@/lib/cart-logic'
import { shippingFor, toPaise } from '@/lib/pricing'
import type { CartQuote } from '@/lib/types'

type CartContextValue = {
  items: CartProduct[]
  count: number
  /** Cart total in rupees as stored locally (kept for simple displays). */
  subtotal: number
  summary: CartSummary
  /** True while the cart is being priced/saved on the server. */
  syncing: boolean
  /** Human-readable adjustments the server made (price/stock changes, removed products). */
  notices: string[]
  dismissNotices: () => void
  addItem: (item: CartInput, quantity?: number) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  removeItem: (lineKey: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/** Read the locally stored cart (guests rely on this; for signed-in users it is a fast cache). */
function readStoredCart() {
  try { return parseStoredCart(window.localStorage.getItem(STORAGE_KEY)) } catch { return [] }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, status: authStatus, markSignedOut } = useAuth()
  const [items, setItems] = useState<CartProduct[]>([])
  const [ready, setReady] = useState(false)
  const [quoted, setQuoted] = useState<{ signature: string; quote: CartQuote } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [mergeTick, setMergeTick] = useState(0)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const syncVersion = useRef(0) // lets a slow response notice it has been superseded
  const merging = useRef(false)
  const mergedFor = useRef<number | null>(null)

  // 1. Load the local cart after mount, so server and client render the same (empty) cart first.
  useEffect(() => {
    setItems(readStoredCart())
    setReady(true)
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) setItems(readStoredCart()) }
    window.addEventListener('storage', onStorage) // keep other tabs in sync
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 2. Persist locally (guests rely on this; for signed-in users it's a fast cache).
  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage full or blocked (e.g. private mode): the cart still works for this session.
    }
  }, [items, ready])

  // 3. Sign-in / sign-out. On sign-in, fold the local cart into the saved one; on sign-out, empty the
  //    local cart so the next person on a shared device doesn't see it (the saved cart stays on the server).
  useEffect(() => {
    if (!ready || authStatus !== 'ready') return
    if (!user) {
      if (mergedFor.current !== null) {
        mergedFor.current = null
        setItems([])
        setQuoted(null)
      }
      return
    }
    if (mergedFor.current === user.id) return
    mergedFor.current = user.id
    merging.current = true // blocks step 4 so it can't overwrite the saved cart with the local one
    void (async () => {
      try {
        const quote = await mergeCart(toLines(itemsRef.current))
        const merged = quote.lines.map(itemFromQuoteLine).filter((line): line is CartProduct => line !== null)
        setItems(merged)
        setQuoted({ signature: signatureOf(merged), quote })
      } catch (error) {
        mergedFor.current = null // try again next time
        if (error instanceof ApiError && error.status === 401) markSignedOut()
      } finally {
        merging.current = false
        setMergeTick((tick) => tick + 1)
      }
    })()
  }, [ready, user, authStatus, markSignedOut])

  // 4. Keep prices/stock fresh and the saved cart up to date. Debounced; guests get a quote only,
  //    signed-in customers also save. Converges: reconcile() only changes lines when the server disagrees.
  useEffect(() => {
    if (!ready || authStatus !== 'ready' || merging.current) return
    if (!user && items.length === 0) { setQuoted(null); return }
    const version = ++syncVersion.current
    const timer = window.setTimeout(async () => {
      setSyncing(true)
      try {
        const current = itemsRef.current
        const lines = toLines(current)
        const quote = user ? await saveCart(lines) : await quoteCart(lines)
        if (version !== syncVersion.current) return // the cart changed while we waited
        setQuoted({ signature: signatureOf(current), quote })
        const result = reconcile(current, quote)
        if (result.changed) setItems(result.items)
        if (result.notices.length) setNotices((existing) => [...new Set([...existing, ...result.notices])])
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) markSignedOut()
        // Otherwise: keep the local cart. Checkout re-prices on the server anyway.
      } finally {
        if (version === syncVersion.current) setSyncing(false)
      }
    }, items.length === 0 ? 0 : SYNC_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [items, ready, user, authStatus, mergeTick, markSignedOut])

  const addItem = useCallback((item: CartInput, quantity = 1) => {
    const lineKey = lineKeyFor(item.id, item.options)
    setItems((current) => {
      const existing = current.find((line) => line.lineKey === lineKey)
      const cap = item.maxQuantity ?? existing?.maxQuantity ?? MAX_QUANTITY
      if (existing) {
        return current.map((line) => (line.lineKey === lineKey
          ? { ...line, maxQuantity: item.maxQuantity ?? line.maxQuantity, quantity: clampQuantity(line.quantity + quantity, cap) }
          : line))
      }
      return [...current, { ...item, lineKey, quantity: clampQuantity(quantity, cap) }]
    })
  }, [])

  const updateQuantity = useCallback((lineKey: string, quantity: number) => {
    setItems((current) => quantity < 1
      ? current.filter((line) => line.lineKey !== lineKey)
      : current.map((line) => (line.lineKey === lineKey ? { ...line, quantity: clampQuantity(quantity, line.maxQuantity) } : line)))
  }, [])

  const removeItem = useCallback((lineKey: string) => setItems((current) => current.filter((line) => line.lineKey !== lineKey)), [])
  const clear = useCallback(() => setItems([]), [])
  const dismissNotices = useCallback(() => setNotices([]), [])

  const value = useMemo<CartContextValue>(() => {
    const localSubtotalPaise = items.reduce((sum, line) => sum + toPaise(line.price) * line.quantity, 0)
    const fresh = quoted && quoted.signature === signatureOf(items) ? quoted.quote : null
    const summary: CartSummary = fresh
      ? { subtotalPaise: fresh.subtotalPaise, shippingPaise: fresh.shippingPaise, totalPaise: fresh.totalPaise, estimated: false }
      : { subtotalPaise: localSubtotalPaise, shippingPaise: shippingFor(localSubtotalPaise), totalPaise: localSubtotalPaise + shippingFor(localSubtotalPaise), estimated: true }
    return {
      items,
      count: items.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: items.reduce((sum, line) => sum + line.price * line.quantity, 0),
      summary, syncing, notices, dismissNotices, addItem, updateQuantity, removeItem, clear,
    }
  }, [items, quoted, syncing, notices, dismissNotices, addItem, updateQuantity, removeItem, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}

export { cartInputFrom, lineKeyFor }
export type { CartInput, CartProduct, CartSummary, CartOptions } from '@/lib/cart-logic'
