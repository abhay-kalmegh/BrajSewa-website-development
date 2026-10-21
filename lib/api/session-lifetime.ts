/**
 * How long the browser keeps the refresh cookie. It must match the server's refresh-token lifetime (Django's
 * JWT_REFRESH_DAYS): a cookie that outlives its token only produces a failed refresh and a sign-out, but a mismatch the
 * other way would sign people out early. docker-compose feeds both from one variable (SESSION_REFRESH_DAYS).
 *
 * Shorter is safer: a stolen refresh token stays useful until it expires. Three days is the default; 1 to 30 is accepted.
 */
export function refreshMaxAgeSeconds(env: { AUTH_REFRESH_DAYS?: string }): number {
  const raw = env.AUTH_REFRESH_DAYS ?? '3'
  const days = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error(`AUTH_REFRESH_DAYS must be a whole number of days from 1 to 30 (got ${JSON.stringify(raw)}).`)
  }
  return days * 24 * 60 * 60
}
