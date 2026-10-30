/** Shapes returned by the Django API. Safe to import from both server and client code. */

export type Product = {
  id: number
  name: string
  slug: string
  description: string
  category: string
  image: string
  badge: string
  details: string[]
  price: number // rupees
  compareAtPrice: number | null // rupees, the struck-through "was" price
  inventory: number
  active: boolean
}

export type QuoteIssue = 'reduced' | 'out_of_stock' | 'unavailable' | null

export type QuoteLine = {
  productId: number
  slug: string | null
  name: string | null
  image: string
  pricePaise: number
  quantity: number // what the server will actually sell (may be less than requested)
  requestedQuantity: number
  inventory: number
  issue: QuoteIssue
}

export type CartQuote = {
  lines: QuoteLine[]
  subtotalPaise: number
  shippingPaise: number
  totalPaise: number
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'fulfilled' | 'cancelled'

export type OrderLineView = {
  productId: number
  slug: string
  name: string
  image: string
  quantity: number
  unitPrice: number // rupees
}

export type OrderView = {
  id: number
  status: OrderStatus
  subtotal: number // rupees
  shipping: number
  total: number
  razorpay_order_id: string | null
  paid_at: string | null
  created_at: string
  lines: OrderLineView[]
  shippingAddress: { name: string; phone: string; email: string; address: string; city: string; state: string; postalCode: string }
}

export type Profile = {
  id: number
  email: string
  role: 'buyer' | 'seller'
  name: string
  firstName: string
  lastName: string
  phone: string
  address: { address: string; city: string; state: string; postalCode: string } | null
}
