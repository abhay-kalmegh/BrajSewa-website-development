/**
 * Browser security headers for every page of the Next.js app (Django sets its own on API responses).
 *
 * IMPORTANT: Next.js evaluates `headers()` at BUILD time and stores the result in the routes manifest, so these values
 * come from build-time environment variables (Docker build args in this repo), not from runtime env vars.
 *
 * The Content-Security-Policy ships in REPORT-ONLY mode: browsers log violations but block nothing, so a mistake in the
 * Razorpay allow-list cannot break checkout. Watch the reports (CSP_REPORT_URI) or the browser console in staging for a
 * week, fix anything legitimate, then rebuild with CSP_ENFORCE=true.
 */
export function buildCsp({ reportUri = '' } = {}) {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is needed by Next.js hydration scripts today; replace with per-request nonces to tighten further.
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
    // next/image serves optimised copies from our own origin, so remote image hosts need no entry here.
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",     // nobody may embed our pages: clickjacking protection
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ]
  if (reportUri) directives.push(`report-uri ${reportUri}`)
  return directives.join('; ')
}

export function buildSecurityHeaders(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const headers = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]
  if (production) {
    // Start short (1 hour) and raise once you have verified HTTPS everywhere: a long HSTS on a mistake is hard to undo.
    // Digits only: parseInt() would accept "1.5" as 1 and "12abc" as 12, silently emitting a nonsense max-age.
    const raw = env.HSTS_MAX_AGE_SECONDS ?? '3600'
    const maxAge = /^\d+$/.test(raw) ? Number(raw) : 3600
    headers.push({
      key: 'Strict-Transport-Security',
      value: `max-age=${maxAge}${env.HSTS_INCLUDE_SUBDOMAINS === 'true' ? '; includeSubDomains' : ''}`,
    })
    headers.push({
      key: env.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      value: buildCsp({ reportUri: env.CSP_REPORT_URI ?? '' }),
    })
  }
  return headers
}
