import { NextResponse } from 'next/server'
import { djangoFetch, guardMutation, jsonError, setAuthCookies } from '@/lib/api/server'

type RegisterBody = { email?: unknown; password?: unknown; firstName?: unknown; lastName?: unknown; phone?: unknown }

export async function POST(req: Request) {
  const blocked = guardMutation(req)
  if (blocked) return blocked

  let body: RegisterBody
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid request.', 400)
  }

  // Allow-list the fields we forward. `role` is deliberately not accepted from the browser:
  // public sign-up always creates a buyer. Sellers are onboarded by an admin.
  const pick = (value: unknown) => (typeof value === 'string' ? value : undefined)
  const payload = {
    email: pick(body.email),
    password: pick(body.password),
    firstName: pick(body.firstName),
    lastName: pick(body.lastName),
    phone: pick(body.phone),
    role: 'buyer',
  }

  let upstream: Response
  try {
    upstream = await djangoFetch('/auth/register/', { method: 'POST', req, body: JSON.stringify(payload) })
  } catch {
    return jsonError('Sign-up is temporarily unavailable.', 502)
  }

  if (upstream.status === 429) return jsonError('Too many attempts. Please wait a minute and try again.', 429)
  if (upstream.status === 409) return jsonError('An account with this email already exists.', 409)
  if (upstream.status === 400) {
    const errors = await upstream.json().catch(() => ({}))
    return jsonError('Please check the highlighted details.', 400, { errors })
  }
  if (!upstream.ok) return jsonError('Sign-up is temporarily unavailable.', 502)

  const { access, refresh, user } = (await upstream.json()) as { access: string; refresh: string; user: unknown }
  await setAuthCookies({ access, refresh })
  return NextResponse.json({ user }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
