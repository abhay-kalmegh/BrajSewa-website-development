import { NextResponse } from 'next/server'
import { authedFetch, jsonError } from '@/lib/api/server'

/**
 * "Who am I?" for the UI. Returns 200 with `user: null` for guests so the browser console isn't
 * littered with 401s on every page load. A real upstream failure is a 502, so the client keeps
 * whatever it already knew instead of wrongly deciding the visitor is signed out.
 */
export async function GET(req: Request) {
  let upstream: Response | null
  try {
    upstream = await authedFetch('/account/me/', { req })
  } catch {
    return jsonError('Service temporarily unavailable.', 502)
  }
  if (!upstream || upstream.status === 401) return NextResponse.json({ user: null }, { headers: { 'Cache-Control': 'no-store' } })
  if (!upstream.ok) return jsonError('Service temporarily unavailable.', 502)
  return NextResponse.json({ user: await upstream.json() }, { headers: { 'Cache-Control': 'no-store' } })
}
