import { NextResponse } from 'next/server'
import { djangoFetch, guardMutation, jsonError } from '@/lib/api/server'

export async function POST(request: Request) {
  const blocked = guardMutation(request)
  if (blocked) return blocked

  let body: { uid?: unknown; token?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request.', 400)
  }
  if (typeof body.uid !== 'string' || typeof body.token !== 'string' || typeof body.password !== 'string' || body.password.length > 256) {
    return jsonError('This password reset link is invalid or expired.', 400)
  }

  try {
    const upstream = await djangoFetch('/auth/password-reset/confirm/', {
      method: 'POST',
      req: request,
      body: JSON.stringify(body),
    })
    const result = await upstream.json().catch(() => ({}))
    return NextResponse.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Password reset is temporarily unavailable.', 502)
  }
}
