import { NextResponse } from 'next/server'
import { matchRule, readTextLimited } from '@/lib/api/proxy-rules'
import { requestIdFor } from '@/lib/api/request-id'
import { authedFetch, djangoFetch, guardMutation, jsonError } from '@/lib/api/server'

/**
 * Authenticated pass-through to Django. The browser calls /api/proxy/<path>; this handler adds the Bearer token from the
 * httpOnly cookie. Which routes exist, and the body-size limit, live in lib/api/proxy-rules.ts.
 */
const NO_BODY_STATUS = new Set([204, 205, 304])

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const match = matchRule(path, req.method)
  if (!match) return jsonError('Not found.', 404)
  const { rule, target } = match

  let body: string | undefined
  if (req.method !== 'GET') {
    const blocked = guardMutation(req)
    if (blocked) return blocked
    const text = await readTextLimited(req)               // refuses an oversized body without buffering it
    if (text === null) return jsonError('Request too large.', 413)
    body = text
  }

  let upstream: Response | null
  try {
    const url = `/${target}${new URL(req.url).search}`
    const init = { method: req.method, body, req }
    // Public routes work without a session (guests price their cart here); everything else needs one.
    upstream = rule.public ? await djangoFetch(url, init) : await authedFetch(url, init)
  } catch {
    return jsonError('Service temporarily unavailable.', 502)
  }
  if (!upstream) return jsonError('Please sign in to continue.', 401)

  return new NextResponse(NO_BODY_STATUS.has(upstream.status) ? null : await upstream.text(), {
    status: upstream.status,
    headers: {
      // Always JSON, never whatever the upstream claimed: an HTML error page must not be rendered by the browser on our
      // origin. nosniff stops the browser second-guessing the type.
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'X-Request-ID': requestIdFor(req),   // quote this id in a support request: it finds the Next.js and Django logs
    },
  })
}

export { handle as GET, handle as POST, handle as PUT }
