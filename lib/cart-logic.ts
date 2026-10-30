/**
 * Pure cart logic (no React, no browser APIs) so it can be unit-tested and reused.
 */
import type { CartQuote, Product, QuoteLine } from '@/lib/types'
import type { CartLineInput } from '@/lib/api/client'

export type CartOptions = Record<string, string>

export type CartProduct = {
  /** Identity of this cart line: product id + chosen options. Two variants of one product are two lines. */
  lineKey: string
  /** Product slug, used for links. */
  id: string
  /** Database id, what the API needs to price and order the line. */
  productId: number
  name: string
  price: number // rupees; refreshed from the server
  image: string
  quantity: number
  /** Units in stock according to the last server quote. */
  maxQuantity?: number
  options?: CartOptions
}

export type CartInput = Omit<CartProduct, 'quantity' | 'lineKey'>

/** The cart line for a catalogue product. */
export const cartInputFrom = (product: Product): CartInput => ({
  id: product.slug, productId: product.id, name: product.name, price: product.price,
  image: product.image, maxQuantity: product.inventory,
})

export type CartSummary = {
  subtotalPaise: number
  shippingPaise: number
  totalPaise: number
  /** true while showing a local estimate because a fresh server quote hasn't arrived yet. */
  estimated: boolean
}

export const STORAGE_KEY = 'brajsewa-cart-v2' // v2: lines now carry the database productId
export const MAX_QUANTITY = 20 // mirrors the API's per-line limit
export const SYNC_DELAY_MS = 500


/**
 * Stable key for a product + options. Option order doesn't matter, and "no options" and an empty
 * options object are the same line.
 */
export function lineKeyFor(id: string, options?: CartOptions) {
  const entries = Object.entries(options ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (!entries.length) return id
  return `${id}?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
}

export const clampQuantity = (value: number, max = MAX_QUANTITY) =>
  Number.isFinite(value) ? Math.min(Math.min(MAX_QUANTITY, max), Math.max(1, Math.floor(value))) : 1

export const toLines = (items: CartProduct[]): CartLineInput[] => items.map((item) => ({ productId: item.productId, quantity: item.quantity }))

/** Identifies the exact set of lines a quote was computed for, so stale totals are never shown. */
export const signatureOf = (items: CartProduct[]) =>
  items.map((item) => `${item.productId}:${item.quantity}`).sort().join(',')

/** Parse and sanitise a stored cart (localStorage contents). Anything malformed is dropped, never thrown. */
export function parseStoredCart(raw: string | null): CartProduct[] {
  try {
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const lines = new Map<string, CartProduct>()
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Partial<CartProduct>
      if (typeof e.id !== 'string' || typeof e.productId !== 'number' || typeof e.name !== 'string'
        || typeof e.price !== 'number' || typeof e.image !== 'string') continue
      const options = e.options && typeof e.options === 'object' ? e.options : undefined
      const lineKey = lineKeyFor(e.id, options)
      const existing = lines.get(lineKey)
      const quantity = clampQuantity(Number(e.quantity))
      lines.set(lineKey, existing
        ? { ...existing, quantity: clampQuantity(existing.quantity + quantity) }
        : { lineKey, id: e.id, productId: e.productId, name: e.name, price: e.price, image: e.image, quantity,
            maxQuantity: typeof e.maxQuantity === 'number' ? e.maxQuantity : undefined, options })
    }
    return [...lines.values()]
  } catch {
    return []
  }
}

/** A cart line built purely from a server quote line (used after merging with the saved cart). */
export function itemFromQuoteLine(line: QuoteLine): CartProduct | null {
  if (!line.slug || line.quantity < 1) return null
  return { lineKey: lineKeyFor(line.slug), id: line.slug, productId: line.productId, name: line.name ?? line.slug,
           price: line.pricePaise / 100, image: line.image, quantity: line.quantity, maxQuantity: line.inventory }
}

/**
 * Apply a server quote to the local lines: refresh names/prices, cap quantities at what is in stock
 * (across lines of the same product), and drop products that can't be sold. Returns the new lines, a
 * list of messages for the customer, and whether anything actually changed.
 */
export function reconcile(items: CartProduct[], quote: CartQuote) {
  const byId = new Map(quote.lines.map((line) => [line.productId, line]))
  const remaining = new Map(quote.lines.map((line) => [line.productId, line.quantity]))
  const notices = new Set<string>()
  const next: CartProduct[] = []
  for (const item of items) {
    const line = byId.get(item.productId)
    if (!line) { next.push(item); continue }
    if (line.issue === 'unavailable' || line.issue === 'out_of_stock') {
      notices.add(`${item.name} is ${line.issue === 'out_of_stock' ? 'out of stock' : 'no longer available'} and was removed from your cart.`)
      continue
    }
    const left = remaining.get(item.productId) ?? 0
    const quantity = Math.min(item.quantity, left)
    remaining.set(item.productId, left - quantity)
    if (quantity < item.quantity) notices.add(`Only ${line.inventory} of ${item.name} ${line.inventory === 1 ? 'is' : 'are'} in stock, so we updated your quantity.`)
    if (quantity < 1) continue
    if (Math.abs(item.price - line.pricePaise / 100) > 0.0001) notices.add(`The price of ${line.name ?? item.name} has changed to ₹${(line.pricePaise / 100).toLocaleString('en-IN')}.`)
    next.push({ ...item, name: line.name ?? item.name, price: line.pricePaise / 100, image: line.image || item.image, maxQuantity: line.inventory, quantity })
  }
  return { items: next, notices: [...notices], changed: JSON.stringify(next) !== JSON.stringify(items) }
}

