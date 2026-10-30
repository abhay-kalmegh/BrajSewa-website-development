import { NextResponse } from 'next/server'
import { clearAuthCookies, djangoFetch, getRefreshToken, guardMutation } from '@/lib/api/server'

export async function POST(req: Request) {
  const blocked = guardMutation(req, { requireJson: false })
  if (blocked) return blocked

  const refresh = await getRefreshToken()
  if (refresh) {
    // Revoke server-side too, so a copied refresh token stops working. Best effort: we still
    // sign the user out locally even if Django is unreachable.
    await djangoFetch('/auth/token/blacklist/', { method: 'POST', req, body: JSON.stringify({ refresh }) }).catch(() => null)
  }
  await clearAuthCookies()
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
