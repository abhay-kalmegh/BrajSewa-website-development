/**
 * Server-side helpers for talking to Django. Import ONLY from route handlers, server actions
 * and server components; never from a 'use client' file (it reads httpOnly cookies and
 * server-only env vars).
 *
 * Security model: the browser never sees a JWT. Login stores them in httpOnly cookies, and the
 * Next.js server attaches the access token when it calls Django on the user's behalf. Script
 * injected into a page (XSS) therefore cannot steal the session.
 */
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/api/client-ip'
import { resolveSecureCookies } from '@/lib/api/cookie-policy'
import { requestIdFor } from '@/lib/api/request-id'

const API = (process.env.API_INTERNAL_URL ?? '').replace(/\/$/, '')

export const ACCESS_COOKIE = 'bs_access'
export const REFRESH_COOKIE = 'bs_refresh'
const ACCESS_MAX_AGE = 15 * 60 // keep in step with SIMPLE_JWT ACCESS_TOKEN_LIFETIME
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // ... and REFRESH_TOKEN_LIFETIME

// Evaluated per call (not at import) so `next build` never trips on it, but a misconfigured production server
// fails closed the first time it would hand out an insecure session cookie. See lib/api/cookie-policy.ts.
const cookieBase = () => ({ httpOnly: true, secure: resolveSecureCookies(process.env), sameSite: 'lax' as const })

export function jsonError(detail: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ detail, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// ---- cookies ------------------------------------------------------------------------------------

export async function setAuthCookies(tokens: { access: string; refresh?: string }) {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, tokens.access, { ...cookieBase(), path: '/', maxAge: ACCESS_MAX_AGE })
  // Scoped to /api so it is sent to the auth and proxy routes but never with page navigations.
  if (tokens.refresh) jar.set(REFRESH_COOKIE, tokens.refresh, { ...cookieBase(), path: '/api', maxAge: REFRESH_MAX_AGE })
}

export async function clearAuthCookies() {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, '', { ...cookieBase(), path: '/', maxAge: 0 })
  jar.set(REFRESH_COOKIE, '', { ...cookieBase(), path: '/api', maxAge: 0 })
}

export async function getRefreshToken() {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null
}

// ---- CSRF guard ---------------------------------------------------------------------------------

/**
 * Cookies are SameSite=Lax, which already blocks cross-site POSTs. This adds defence in depth:
 * a state-changing request must come from our own origin and (by default) be JSON, which a
 * plain HTML form cannot send. Returns an error response to return early, or null if OK.
 */
export function guardMutation(req: Request, options: { requireJson?: boolean } = {}) {
  const { requireJson = true } = options
  const site = req.headers.get('sec-fetch-site')
  let sameOrigin: boolean
  if (site) {
    sameOrigin = site === 'same-origin' || site === 'none'
  } else {
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    try {
      sameOrigin = !origin || new URL(origin).host === host
    } catch {
      sameOrigin = false
    }
  }
  if (!sameOrigin) return jsonError('Cross-site request blocked.', 403)
  if (requireJson && !(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonError('Expected application/json.', 415)
  }
  return null
}

// ---- Django calls -------------------------------------------------------------------------------

type DjangoInit = { method?: string; body?: string; headers?: Record<string, string>; req?: Request }

// How many proxies YOU operate between the internet and this server (CloudFront + ALB = 2, ALB only = 1, none = 0).
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? '1')

/**
 * Tell Django who the caller is so its per-IP rate limiting sees users, not this server.
 * The client-supplied X-Forwarded-For is NOT copied as-is: a forged value would give every request a fresh
 * rate-limit bucket. We send one address, taken from the hops our own infrastructure appended.
 */
function forwardedHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = { 'X-Request-ID': requestIdFor(req) }
  const ip = clientIp(req?.headers.get('x-forwarded-for'), TRUSTED_PROXY_HOPS)
  if (ip) headers['X-Forwarded-For'] = ip
  // Django enforces HTTPS and trusts this header, but this hop is plain HTTP on a private network. Without it Django
  // would redirect every internal call to https:// and the site would break. We assert it ourselves in production
  // instead of relaying whatever the client sent.
  if (process.env.NODE_ENV === 'production') headers['X-Forwarded-Proto'] = 'https'
  return headers
}

export async function djangoFetch(path: string, init: DjangoInit = {}) {
  if (!API) throw new Error('API_INTERNAL_URL is not configured')
  const { req, headers, ...rest } = init
  return fetch(`${API}/api/v1${path}`, {
    ...rest,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...forwardedHeaders(req), ...headers },
  })
}

/** Exchange the refresh cookie for a new access token. Returns null if the user is signed out. */
export async function refreshAccessToken(req?: Request): Promise<string | null> {
  const refresh = await getRefreshToken()
  if (!refresh) return null
  const response = await djangoFetch('/auth/token/refresh/', { method: 'POST', body: JSON.stringify({ refresh }), req })
  if (response.status === 400 || response.status === 401) {
    await clearAuthCookies() // token expired or blacklisted: the session is really over
    return null
  }
  if (!response.ok) return null // transient upstream problem: keep the cookies, don't sign the user out
  const data = (await response.json()) as { access: string; refresh?: string }
  await setAuthCookies({ access: data.access, refresh: data.refresh })
  return data.access
}

/**
 * Call Django as the signed-in user. Refreshes the access token transparently (once) when it has
 * expired. Returns null when there is no valid session. Only call from route handlers or server
 * actions: server components cannot set cookies.
 */
export async function authedFetch(path: string, init: DjangoInit = {}): Promise<Response | null> {
  const jar = await cookies()
  let access = jar.get(ACCESS_COOKIE)?.value ?? (await refreshAccessToken(init.req))
  if (!access) return null

  const call = (token: string) =>
    djangoFetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })

  let response = await call(access)
  if (response.status === 401) {
    access = await refreshAccessToken(init.req)
    if (!access) return null
    response = await call(access)
  }
  return response
}
