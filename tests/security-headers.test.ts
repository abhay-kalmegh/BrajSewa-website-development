/** Run with:  npx tsx tests/security-headers.test.ts */
import assert from 'node:assert/strict'
import { buildCsp, buildSecurityHeaders } from '../security-headers.mjs'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
const get = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value

const prod = buildSecurityHeaders({ NODE_ENV: 'production' })
const dev = buildSecurityHeaders({ NODE_ENV: 'development' })

t('clickjacking protection in production AND development', () => {
  for (const h of [prod, dev]) assert.equal(get(h, 'X-Frame-Options'), 'DENY')
})
t('basic hardening headers always present', () => {
  for (const h of [prod, dev]) {
    assert.equal(get(h, 'X-Content-Type-Options'), 'nosniff')
    assert.equal(get(h, 'Referrer-Policy'), 'strict-origin-when-cross-origin')
    assert.match(get(h, 'Permissions-Policy') ?? '', /camera=\(\)/)
  }
})
t('HSTS and CSP are production-only (they would break or spam plain-http development)', () => {
  assert.equal(get(dev, 'Strict-Transport-Security'), undefined)
  assert.equal(get(dev, 'Content-Security-Policy-Report-Only'), undefined)
  assert.ok(get(prod, 'Strict-Transport-Security'))
})
t('HSTS starts at one hour and has no includeSubDomains by default', () => assert.equal(get(prod, 'Strict-Transport-Security'), 'max-age=3600'))
t('HSTS is configurable and can include subdomains', () => {
  const h = buildSecurityHeaders({ NODE_ENV: 'production', HSTS_MAX_AGE_SECONDS: '31536000', HSTS_INCLUDE_SUBDOMAINS: 'true' })
  assert.equal(get(h, 'Strict-Transport-Security'), 'max-age=31536000; includeSubDomains')
})
t('a nonsense HSTS value falls back to the safe default instead of emitting garbage', () => {
  for (const bad of ['abc', '-5', '1.5', '12abc', '1e3', ' 60', '']) assert.equal(get(buildSecurityHeaders({ NODE_ENV: 'production', HSTS_MAX_AGE_SECONDS: bad }), 'Strict-Transport-Security'), 'max-age=3600', bad)
})
t('CSP is REPORT-ONLY by default (cannot break checkout)', () => {
  assert.ok(get(prod, 'Content-Security-Policy-Report-Only'))
  assert.equal(get(prod, 'Content-Security-Policy'), undefined)
})
t('CSP_ENFORCE=true switches to the enforcing header, and only that one', () => {
  const h = buildSecurityHeaders({ NODE_ENV: 'production', CSP_ENFORCE: 'true' })
  assert.ok(get(h, 'Content-Security-Policy')); assert.equal(get(h, 'Content-Security-Policy-Report-Only'), undefined)
})
t('CSP forbids framing, plugins, and base/form hijacking', () => {
  const csp = buildCsp()
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) assert.ok(csp.includes(d), d)
})
t('CSP allows Razorpay for scripts and frames, and nothing broader', () => {
  const csp = buildCsp()
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/checkout\.razorpay\.com/)
  assert.match(csp, /frame-src https:\/\/api\.razorpay\.com https:\/\/checkout\.razorpay\.com/)
  assert.ok(!/\*/.test(csp), 'no wildcard sources')
  assert.ok(!csp.includes("'unsafe-eval'"), 'no eval')
})
t('CSP report-uri is added only when configured', () => {
  assert.ok(!buildCsp().includes('report-uri'))
  assert.ok(buildCsp({ reportUri: 'https://r.example/csp' }).endsWith('report-uri https://r.example/csp'))
})

;(async () => {
  const config = (await import('../next.config.mjs')).default
  const check = (name: string, cond: unknown) => { assert.ok(cond, name); n++; console.log('ok  ', name) }

  check('next.config.mjs loads and hides X-Powered-By', config.poweredByHeader === false)
  const rules = await config.headers()
  check('next.config.mjs applies the headers to every path', rules.length === 1 && rules[0].source === '/:path*' && rules[0].headers.length >= 4)
  const unsplash = config.images.remotePatterns.find((p: { hostname: string }) => p.hostname === 'images.unsplash.com')
  check('image optimizer allow-list is restricted to https photo paths', unsplash.pathname === '/photo-*' && unsplash.protocol === 'https')
  check('optimised images are cached for a day', config.images.minimumCacheTTL === 86400)
  check('standalone output is preserved (the Docker image depends on it)', config.output === 'standalone')
  console.log(`\n${n} checks passed`)
})()
