import { NextResponse } from 'next/server'
import { djangoFetch, guardMutation, jsonError } from '@/lib/api/server'

export async function POST(request: Request) {
  const blocked = guardMutation(request)
  if (blocked) return blocked

  let body: { uid?: unknown; token?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request.', 400)
  }
  if (typeof body.uid !== 'string' || typeof body.token !== 'string' || body.uid.length > 128 || body.token.length > 128) {
    return jsonError('This email verification link is invalid or expired.', 400)
  }

  try {
    const upstream = await djangoFetch('/auth/email-verification/confirm/', {
      method: 'POST',
      req: request,
      body: JSON.stringify(body),
    })
    const result = await upstream.json().catch(() => ({}))
    return NextResponse.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Email verification is temporarily unavailable.', 502)
  }
}
