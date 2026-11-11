import { NextResponse } from 'next/server'
import { djangoFetch, guardMutation, jsonError } from '@/lib/api/server'

export async function POST(request: Request) {
  const blocked = guardMutation(request)
  if (blocked) return blocked

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request.', 400)
  }
  if (typeof body.email !== 'string' || body.email.length > 254) {
    return jsonError('Enter a valid email address.', 400)
  }

  try {
    const upstream = await djangoFetch('/auth/email-verification/resend/', {
      method: 'POST',
      req: request,
      body: JSON.stringify({ email: body.email.trim() }),
    })
    const result = await upstream.json().catch(() => ({}))
    return NextResponse.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Email verification is temporarily unavailable.', 502)
  }
}
