import { NextResponse } from 'next/server'
import { djangoFetch, guardMutation, jsonError, setAuthCookies } from '@/lib/api/server'

export async function POST(req: Request) {
  const blocked = guardMutation(req)
  if (blocked) return blocked

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid request.', 400)
  }
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email || !body.password) {
    return jsonError('Enter your email and password.', 400)
  }

  let upstream: Response
  try {
    // SimpleJWT's field is `username` (accounts use the email as the username). The old client sent `email`.
    upstream = await djangoFetch('/auth/token/', {
      method: 'POST',
      req,
      body: JSON.stringify({ username: body.email, password: body.password }),
    })
  } catch {
    return jsonError('Sign-in is temporarily unavailable.', 502)
  }

  if (upstream.status === 429) return jsonError('Too many attempts. Please wait a minute and try again.', 429)
  if (upstream.status >= 500) return jsonError('Sign-in is temporarily unavailable.', 502)
  // One message for unknown email and wrong password, so the form can't be used to find accounts.
  if (!upstream.ok) return jsonError('Invalid email or password.', 401)

  const { access, refresh } = (await upstream.json()) as { access: string; refresh: string }
  await setAuthCookies({ access, refresh })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
