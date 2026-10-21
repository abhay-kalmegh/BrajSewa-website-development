/**
 * Display helpers. The server is the source of truth for every amount that is actually charged;
 * the shipping rule below only powers the estimate shown while a fresh server quote is loading.
 * Keep in sync with backend/shop/pricing.py.
 */
export const FREE_SHIPPING_THRESHOLD_PAISE = 49_900
export const FLAT_SHIPPING_PAISE = 4_900

export const shippingFor = (subtotalPaise: number) =>
  subtotalPaise === 0 || subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : FLAT_SHIPPING_PAISE

export const toPaise = (rupees: number) => Math.round(rupees * 100)

export const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export const formatRupees = (rupees: number) => formatINR(toPaise(rupees))

export const orderNumber = (id: number | string) => `BS-${String(id).padStart(6, '0')}`

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
