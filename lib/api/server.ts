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

const API = (process.env.API_INTERNAL_URL ?? '').replace(/\/$/, '')

export const ACCESS_COOKIE = 'bs_access'
export const REFRESH_COOKIE = 'bs_refresh'
const ACCESS_MAX_AGE = 15 * 60 // keep in step with SIMPLE_JWT ACCESS_TOKEN_LIFETIME
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // ... and REFRESH_TOKEN_LIFETIME

// Secure cookies need HTTPS. Set AUTH_COOKIE_SECURE=false only for local plain-HTTP runs.
const SECURE = (process.env.AUTH_COOKIE_SECURE ?? String(process.env.NODE_ENV === 'production')) === 'true'
const base = { httpOnly: true, secure: SECURE, sameSite: 'lax' as const }

export function jsonError(detail: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ detail, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// ---- cookies ------------------------------------------------------------------------------------

export async function setAuthCookies(tokens: { access: string; refresh?: string }) {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, tokens.access, { ...base, path: '/', maxAge: ACCESS_MAX_AGE })
  // Scoped to /api so it is sent to the auth and proxy routes but never with page navigations.
  if (tokens.refresh) jar.set(REFRESH_COOKIE, tokens.refresh, { ...base, path: '/api', maxAge: REFRESH_MAX_AGE })
}

export async function clearAuthCookies() {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, '', { ...base, path: '/', maxAge: 0 })
  jar.set(REFRESH_COOKIE, '', { ...base, path: '/api', maxAge: 0 })
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

/** Forward the client's address so Django's per-IP rate limiting sees users, not this server. */
function forwardedHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {}
  const forwardedFor = req?.headers.get('x-forwarded-for')
  const forwardedProto = req?.headers.get('x-forwarded-proto')
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor
  if (forwardedProto) headers['X-Forwarded-Proto'] = forwardedProto
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
