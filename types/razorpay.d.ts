// Minimal typings for Razorpay Checkout (loaded from https://checkout.razorpay.com/v1/checkout.js).
interface RazorpaySuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayFailureResponse {
  error?: { code?: string; description?: string; reason?: string }
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description?: string
  image?: string
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  handler: (response: RazorpaySuccessResponse) => void
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean }
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', callback: (response: RazorpayFailureResponse) => void): void
}

interface Window {
  Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
}
