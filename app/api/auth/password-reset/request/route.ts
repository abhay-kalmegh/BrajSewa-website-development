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
    const upstream = await djangoFetch('/auth/password-reset/request/', {
      method: 'POST',
      req: request,
      body: JSON.stringify({ email: body.email.trim() }),
    })
    if (upstream.status === 429) return jsonError('Too many requests. Please try again later.', 429)
    if (!upstream.ok) return jsonError('Password reset is temporarily unavailable.', 502)
    return NextResponse.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Password reset is temporarily unavailable.', 502)
  }
}
