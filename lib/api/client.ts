/**
 * Browser-side API client. It only ever talks to this app's own /api routes, which hold the session
 * in httpOnly cookies and call Django server-side (see lib/api/server.ts). No tokens in JavaScript.
 */

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
export type CreateOrderPayload = { customer: CheckoutCustomer; lines: CheckoutLine[] }
export type CreateOrderResponse = {
  orderId: string
  razorpayOrderId: string
  amount: number // paise, authoritative (includes shipping)
  subtotal: number // paise
  shipping: number // paise
  currency: 'INR'
  keyId: string
}
export type RazorpayPaymentResult = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
export type Profile = { id: number; email: string; role: 'buyer' | 'seller'; name: string }
export type SellerProduct = {
  id: number
  name: string
  slug: string
  description: string
  category: string
  image_url: string
  price_paise: number
  compare_at_price_paise: number | null
  inventory: number
  active: boolean
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

function messageFrom(body: unknown, fallback: string) {
  const detail = (body as { detail?: unknown } | null)?.detail
  return typeof detail === 'string' ? detail : fallback
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

export const getMyProfile = () => request<Profile>('/api/proxy/account/me/')

// ---- commerce -----------------------------------------------------------------------------------
export const createCheckoutOrder = (payload: CreateOrderPayload) =>
  request<CreateOrderResponse>('/api/proxy/orders/', { method: 'POST', body: json(payload) })

export const getOrder = (orderId: string) =>
  request<{ id: number; status: string; subtotal: number; shipping: number; total: number; paid_at: string | null }>(
    `/api/proxy/orders/${encodeURIComponent(orderId)}/`,
  )

export const verifyPayment = (payload: RazorpayPaymentResult) =>
  request<{ status: string; orderId: string }>('/api/proxy/payments/razorpay/verify/', { method: 'POST', body: json(payload) })

export const getSellerProducts = () => request<SellerProduct[]>('/api/proxy/seller/products/')
