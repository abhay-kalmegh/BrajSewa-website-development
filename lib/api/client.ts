export type ApiConfig = { baseUrl: string }

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
export type CreateOrderResponse = { orderId: string; razorpayOrderId: string; amount: number; currency: 'INR'; keyId: string }

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '')

export const apiConfig: ApiConfig = { baseUrl: baseUrl ?? '' }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiConfig.baseUrl) throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured')
  const response = await fetch(`${apiConfig.baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) throw new Error(`API request failed: ${response.status}`)
  return response.json() as Promise<T>
}

export function createCheckoutOrder(payload: CreateOrderPayload) {
  return request<CreateOrderResponse>('/api/v1/orders/', { method: 'POST', body: JSON.stringify(payload) })
}

export function getOrder(orderId: string) {
  return request<{ id: string; status: string; total: number; currency: string }>(`/api/v1/orders/${encodeURIComponent(orderId)}/`)
}

export function login(payload: { email: string; password: string }) {
  return request<{ access: string; refresh: string }>('/api/v1/auth/token/', { method: 'POST', body: JSON.stringify(payload) })
}
