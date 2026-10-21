'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type CartProduct = { id: string; name: string; price: number; image: string; quantity: number; options?: Record<string, string> }
type CartContextValue = { items: CartProduct[]; count: number; subtotal: number; addItem: (item: Omit<CartProduct, 'quantity'>, quantity?: number) => void; updateQuantity: (id: string, quantity: number) => void; removeItem: (id: string) => void; clear: () => void }
const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartProduct[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => { try { const saved = window.localStorage.getItem('brajsewa-cart'); if (saved) setItems(JSON.parse(saved)) } catch {} setReady(true) }, [])
  useEffect(() => { if (ready) window.localStorage.setItem('brajsewa-cart', JSON.stringify(items)) }, [items, ready])
  const value = useMemo(() => ({ items, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0), addItem: (item: Omit<CartProduct, 'quantity'>, quantity = 1) => setItems((current) => { const existing = current.find((entry) => entry.id === item.id && JSON.stringify(entry.options) === JSON.stringify(item.options)); if (existing) return current.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + quantity } : entry); return [...current, { ...item, quantity }] }), updateQuantity: (id: string, quantity: number) => setItems((current) => quantity < 1 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity } : item)), removeItem: (id: string) => setItems((current) => current.filter((item) => item.id !== id)), clear: () => setItems([]) }), [items, ready])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('useCart must be used inside CartProvider'); return value }
