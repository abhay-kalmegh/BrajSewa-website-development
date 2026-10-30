/** Run with:  npx tsx tests/safe-redirect.test.ts */
import assert from 'node:assert/strict'
import { safeNext } from '../lib/safe-redirect'

const ORIGIN = 'https://shop.example'
let n = 0
const t = (name: string, raw: string | null | undefined, want: string) => { assert.equal(safeNext(raw, ORIGIN), want, name); n++; console.log('ok  ', name) }
const SAFE = '/shop'   // the fallback

// legitimate destinations are preserved, including query and hash
t('relative path', '/account', '/account')
t('path with query and hash', '/checkout?step=2#pay', '/checkout?step=2#pay')
t('absolute URL on our own origin is reduced to its path', 'https://shop.example/account?x=1#h', '/account?x=1#h')
t('protocol-relative URL to our own host', '//shop.example/orders', '/orders')
t('encoded slash stays a harmless path', '/%2F/evil.com', '/%2F/evil.com')
t('missing / empty falls back', '', SAFE); t('null falls back', null, SAFE); t('undefined falls back', undefined, SAFE)

// every one of these used to, or could, send the customer to another site
t('protocol-relative to another host', '//evil.com', SAFE)
t('backslash host', '/\\evil.com', SAFE)
t('tab hidden inside the prefix', '/\t/evil.com', SAFE)
t('newline hidden inside the prefix', '/\n/evil.com', SAFE)
t('carriage return hidden inside the prefix', '/\r/evil.com', SAFE)
t('dot-segment trick normalises to //evil.com', '/.//evil.com', SAFE)
t('dot-dot-segment trick', '/..//evil.com', SAFE)
t('deeper dot-segment trick', '/a/..//evil.com', SAFE)
t('absolute URL to another origin', 'https://evil.com', SAFE)
t('same host, different scheme', 'http://shop.example/x', SAFE)
t('same host, different port', 'https://shop.example:8443/x', SAFE)
t('look-alike host', 'https://shop.example.evil.com/x', SAFE)
t('userinfo trick', 'https://shop.example@evil.com/x', SAFE)
t('javascript: URL', 'javascript:alert(1)', SAFE)
t('data: URL', 'data:text/html,<script>alert(1)</script>', SAFE)
t('whitespace-prefixed javascript:', '  javascript:alert(1)', SAFE)

// whatever comes back must always be a single-slash path on our origin
for (const raw of ['/a', '//b', '/\t/c', '/.//d', 'https://e.com', 'javascript:1', '/%09/f', '\\\\g', '/ /h', '////i']) {
  const out = safeNext(raw, ORIGIN)
  assert.ok(out.startsWith('/') && !out.startsWith('//'), `unsafe result for ${JSON.stringify(raw)}: ${out}`)
  assert.equal(new URL(out, ORIGIN).origin, ORIGIN)
  n++
}
console.log('ok   every result is a same-origin, single-slash path')
console.log(`\n${n} checks passed`)
