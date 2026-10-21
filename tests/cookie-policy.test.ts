/** Run with:  npx tsx tests/cookie-policy.test.ts */
import assert from 'node:assert/strict'
import { resolveSecureCookies } from '../lib/api/cookie-policy'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

t('production with nothing set defaults to Secure', () => assert.equal(resolveSecureCookies({ NODE_ENV: 'production' }), true))
t('production, explicitly secure', () => assert.equal(resolveSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'true' }), true))
t('production with AUTH_COOKIE_SECURE=false is refused', () =>
  assert.throws(() => resolveSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }), /Refusing to set auth cookies/))
t('production with a typo (anything but "true") is refused, not silently insecure', () =>
  assert.throws(() => resolveSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'yes' }), /Refusing/))
t('production insecure is allowed only with the explicit opt-out', () =>
  assert.equal(resolveSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false', ALLOW_INSECURE_COOKIES: 'true' }), false))
t('the opt-out alone does not make cookies insecure', () =>
  assert.equal(resolveSecureCookies({ NODE_ENV: 'production', ALLOW_INSECURE_COOKIES: 'true' }), true))
t('development defaults to non-Secure (works on http://localhost)', () => assert.equal(resolveSecureCookies({ NODE_ENV: 'development' }), false))
t('development can still opt in to Secure', () => assert.equal(resolveSecureCookies({ NODE_ENV: 'development', AUTH_COOKIE_SECURE: 'true' }), true))
console.log(`\n${n} checks passed`)
