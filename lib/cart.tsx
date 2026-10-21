'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type CartOptions = Record<string, string>

export type CartProduct = {
  /** Identity of this cart line: product id + chosen options. Two variants of one product are two lines. */
  lineKey: string
  id: string
  name: string
  price: number
  image: string
  quantity: number
  options?: CartOptions
}

export type CartInput = Omit<CartProduct, 'quantity' | 'lineKey'>

type CartContextValue = {
  items: CartProduct[]
  count: number
  subtotal: number
  addItem: (item: CartInput, quantity?: number) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  removeItem: (lineKey: string) => void
  clear: () => void
}

const STORAGE_KEY = 'brajsewa-cart'
const MAX_QUANTITY = 20 // mirrors the API's per-line limit

const CartContext = createContext<CartContextValue | null>(null)

/**
 * Stable key for a product + options. Option order doesn't matter, and "no options" and an empty
 * options object are the same line. (The old code compared JSON.stringify(options), which treated
 * {size:'S',color:'red'} and {color:'red',size:'S'} as different, and undefined vs {} as different,
 * and then updated/removed lines by product id alone, so variants of one product collided.)
 */
export function lineKeyFor(id: string, options?: CartOptions) {
  const entries = Object.entries(options ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (!entries.length) return id
  return `${id}?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
}

const clampQuantity = (value: number) => (Number.isFinite(value) ? Math.min(MAX_QUANTITY, Math.max(1, Math.floor(value))) : 1)

/** Read and sanitise the stored cart. Also upgrades carts saved before `lineKey` existed. */
function readStoredCart(): CartProduct[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const lines = new Map<string, CartProduct>()
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Partial<CartProduct>
      if (typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.price !== 'number' || typeof e.image !== 'string') continue
      const options = e.options && typeof e.options === 'object' ? e.options : undefined
      const lineKey = lineKeyFor(e.id, options)
      const existing = lines.get(lineKey)
      const quantity = clampQuantity(Number(e.quantity))
      lines.set(lineKey, existing
        ? { ...existing, quantity: clampQuantity(existing.quantity + quantity) }
        : { lineKey, id: e.id, name: e.name, price: e.price, image: e.image, quantity, options })
    }
    return [...lines.values()]
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartProduct[]>([])
  const [ready, setReady] = useState(false)

  // Load after mount so server and client render the same (empty) cart first: no hydration mismatch.
  useEffect(() => {
    setItems(readStoredCart())
    setReady(true)
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) setItems(readStoredCart()) }
    window.addEventListener('storage', onStorage) // keep other tabs in sync
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage full or blocked (e.g. private mode): the cart still works for this session.
    }
  }, [items, ready])

  const addItem = useCallback((item: CartInput, quantity = 1) => {
    const lineKey = lineKeyFor(item.id, item.options)
    setItems((current) => {
      const existing = current.find((line) => line.lineKey === lineKey)
      if (existing) {
        return current.map((line) => (line.lineKey === lineKey ? { ...line, quantity: clampQuantity(line.quantity + quantity) } : line))
      }
      return [...current, { ...item, lineKey, quantity: clampQuantity(quantity) }]
    })
  }, [])

  const updateQuantity = useCallback((lineKey: string, quantity: number) => {
    setItems((current) => quantity < 1
      ? current.filter((line) => line.lineKey !== lineKey)
      : current.map((line) => (line.lineKey === lineKey ? { ...line, quantity: clampQuantity(quantity) } : line)))
  }, [])

  const removeItem = useCallback((lineKey: string) => {
    setItems((current) => current.filter((line) => line.lineKey !== lineKey))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: items.reduce((sum, line) => sum + line.price * line.quantity, 0),
    addItem, updateQuantity, removeItem, clear,
  }), [items, addItem, updateQuantity, removeItem, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
