/**
 * What the browser may reach through /api/proxy/*, and how large a request body may be. Kept free of Next.js imports so it
 * can be tested directly.
 */
export type ProxyRule = { prefix: string; methods: string[]; public?: boolean }

// First match wins, so the specific cart routes come before the generic one.
// Only endpoints the storefront actually uses are listed: adding a Django endpoint never exposes it to the browser by
// accident. (The seller endpoints were removed: no page uses them, and an unused route is attack surface for nothing.)
export const ALLOWED: ProxyRule[] = [
  { prefix: 'cart/quote/', methods: ['POST'], public: true }, // live prices for guests and customers
  { prefix: 'cart/merge/', methods: ['POST'] },
  { prefix: 'cart/', methods: ['GET', 'PUT'] }, // the signed-in customer's saved cart
  { prefix: 'orders/', methods: ['GET', 'POST'] }, // order history, create order, order detail
  { prefix: 'payments/razorpay/verify/', methods: ['POST'] },
  { prefix: 'account/me/', methods: ['GET'] },
]

const SEGMENT = /^[A-Za-z0-9_-]+$/ // rejects '..', '.', encoded slashes, empty and anything else surprising

/** The rule for this path and method, or null when the request must be answered 404. */
export function matchRule(path: string[], method: string): { rule: ProxyRule; target: string } | null {
  if (!path.length || !path.every((segment) => SEGMENT.test(segment))) return null
  const target = `${path.join('/')}/`
  const rule = ALLOWED.find((entry) => target.startsWith(entry.prefix))
  return rule && rule.methods.includes(method) ? { rule, target } : null
}

/** No legitimate request to this proxy (a cart, an address, a payment confirmation) comes close to this size. */
export const MAX_BODY_BYTES = 64 * 1024

/** Cheap pre-check on a declared Content-Length. Returns true only when the header says the body is too big. */
export function declaredTooLarge(contentLength: string | null, max = MAX_BODY_BYTES): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) return false // unknown: the streaming limit decides
  return Number(contentLength) > max
}

/**
 * Read a request body as text, refusing more than `max` bytes. The header can lie or be absent (chunked uploads), so the
 * bytes are counted as they arrive and the stream is cancelled the moment the limit is crossed, instead of buffering an
 * unbounded body in memory first. Returns null when the body is too large.
 */
export async function readTextLimited(req: Request, max = MAX_BODY_BYTES): Promise<string | null> {
  if (declaredTooLarge(req.headers.get('content-length'), max)) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
