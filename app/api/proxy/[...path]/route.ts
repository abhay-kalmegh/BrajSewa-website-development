import { NextResponse } from 'next/server'
import { requestIdFor } from '@/lib/api/request-id'
import { authedFetch, djangoFetch, guardMutation, jsonError } from '@/lib/api/server'

/**
 * Authenticated pass-through to Django. The browser calls /api/proxy/<path>; this handler adds the
 * Bearer token from the httpOnly cookie. Only the routes below are reachable, so adding an endpoint
 * to Django never silently exposes it to the browser.
 */
const ALLOWED: Array<{ prefix: string; methods: string[]; public?: boolean }> = [
  // First match wins, so the specific cart routes come before the generic one.
  { prefix: 'cart/quote/', methods: ['POST'], public: true }, // live prices for guests and customers
  { prefix: 'cart/merge/', methods: ['POST'] },
  { prefix: 'cart/', methods: ['GET', 'PUT'] }, // the signed-in customer's saved cart
  { prefix: 'orders/', methods: ['GET', 'POST'] }, // order history, create order, order detail
  { prefix: 'payments/razorpay/verify/', methods: ['POST'] },
  { prefix: 'account/me/', methods: ['GET'] },
  { prefix: 'seller/products/', methods: ['GET', 'POST'] },
]
const SEGMENT = /^[A-Za-z0-9_-]+$/ // rejects '..', encoded slashes and anything else surprising
const NO_BODY_STATUS = new Set([204, 205, 304])

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  if (!path.length || !path.every((segment) => SEGMENT.test(segment))) return jsonError('Not found.', 404)

  const target = `${path.join('/')}/`
  const rule = ALLOWED.find((entry) => target.startsWith(entry.prefix))
  if (!rule || !rule.methods.includes(req.method)) return jsonError('Not found.', 404)

  if (req.method !== 'GET') {
    const blocked = guardMutation(req)
    if (blocked) return blocked
  }

  let upstream: Response | null
  try {
    const url = `/${target}${new URL(req.url).search}`
    const init = { method: req.method, body: req.method === 'GET' ? undefined : await req.text(), req }
    // Public routes work without a session (guests price their cart here); everything else needs one.
    upstream = rule.public ? await djangoFetch(url, init) : await authedFetch(url, init)
  } catch {
    return jsonError('Service temporarily unavailable.', 502)
  }
  if (!upstream) return jsonError('Please sign in to continue.', 401)

  return new NextResponse(NO_BODY_STATUS.has(upstream.status) ? null : await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
      'X-Request-ID': requestIdFor(req),   // quote this id in a support request: it finds the Next.js and Django logs
    },
  })
}

export { handle as GET, handle as POST, handle as PUT }
