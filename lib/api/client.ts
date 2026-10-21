/**
 * Browser-side API client. It only ever talks to this app's own /api routes, which hold the session
 * in httpOnly cookies and call Django server-side (see lib/api/server.ts). No tokens in JavaScript.
 */

import type { CartQuote, OrderView, Profile } from '@/lib/types'

export type { Profile }

export type CheckoutCustomer = {
  email: string
  phone: string
  firstName: string
  lastName?: string
  address: string
  city: string
  state: string
  postalCode: string
}

export type CheckoutLine = { productId: number; quantity: number }
export type CreateOrderPayload = { customer: CheckoutCustomer; lines: CheckoutLine[]; saveAddress?: boolean }
export type CreateOrderResponse = {
  orderId: string
  razorpayOrderId: string
  amount: number // paise, authoritative (includes shipping)
  subtotal: number // paise
  shipping: number // paise
  currency: 'INR'
  keyId: string
  reused: boolean // true when an identical unpaid order was resumed instead of creating a new one
}
export type RazorpayPaymentResult = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message)
  }
  /** Field-level messages from Django validation, e.g. { password: ['Too common.'] } */
  get fieldErrors(): Record<string, string[]> {
    const errors = (this.body as { errors?: unknown } | null)?.errors
    return errors && typeof errors === 'object' ? (errors as Record<string, string[]>) : {}
  }
}

/** First human-readable message in an API error body: `detail`, or the first field error DRF reports. */
function messageFrom(body: unknown, fallback: string): string {
  const find = (value: unknown, depth = 0): string | null => {
    if (typeof value === 'string') return value
    if (depth > 4 || value === null || typeof value !== 'object') return null
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = find(child, depth + 1)
      if (found) return found
    }
    return null
  }
  const detail = (body as { detail?: unknown } | null)?.detail
  return (typeof detail === 'string' ? detail : find(body)) ?? fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(messageFrom(body, `Request failed (${response.status})`), response.status, body)
  return body as T
}

const json = (value: unknown) => JSON.stringify(value)

// ---- auth ---------------------------------------------------------------------------------------
export const login = (payload: { email: string; password: string }) =>
  request<{ ok: true }>('/api/auth/login', { method: 'POST', body: json(payload) })

export const register = (payload: { email: string; password: string; firstName: string; lastName?: string; phone?: string }) =>
  request<{ user: Profile }>('/api/auth/register', { method: 'POST', body: json(payload) })

export const logout = () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' })

export const getSession = () => request<{ user: Profile | null }>('/api/auth/session')

export const getMyProfile = () => request<Profile>('/api/proxy/account/me/')

// ---- cart ---------------------------------------------------------------------------------------
// Only product ids and quantities go to the server; it answers with live prices and stock.
export type CartLineInput = { productId: number; quantity: number }

/** Works for guests too. */
export const quoteCart = (lines: CartLineInput[]) =>
  request<CartQuote>('/api/proxy/cart/quote/', { method: 'POST', body: json({ lines }) })

/** Signed-in only: replace the saved cart. */
export const saveCart = (lines: CartLineInput[]) =>
  request<CartQuote>('/api/proxy/cart/', { method: 'PUT', body: json({ lines }) })

/** Signed-in only: add the guest's local cart into the saved one (done once after sign-in). */
export const mergeCart = (lines: CartLineInput[]) =>
  request<CartQuote>('/api/proxy/cart/merge/', { method: 'POST', body: json({ lines }) })

// ---- orders & payment ---------------------------------------------------------------------------
export const createCheckoutOrder = (payload: CreateOrderPayload) =>
  request<CreateOrderResponse>('/api/proxy/orders/', { method: 'POST', body: json(payload) })

export const listOrders = () => request<OrderView[]>('/api/proxy/orders/')

export const getOrder = (orderId: string | number) =>
  request<OrderView>(`/api/proxy/orders/${encodeURIComponent(String(orderId))}/`)

export const verifyPayment = (payload: RazorpayPaymentResult) =>
  request<{ status: string; orderId: string }>('/api/proxy/payments/razorpay/verify/', { method: 'POST', body: json(payload) })

