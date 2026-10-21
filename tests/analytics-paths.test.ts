/** Run with:  npx tsx tests/analytics-paths.test.ts */
import assert from 'node:assert/strict'
import { filterAnalyticsEvent, shouldTrack } from '../lib/analytics-paths'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

t('public pages are tracked', () => { for (const p of ['/', '/shop', '/shop/tulsi-japa-mala', '/about', '/faq', '/cart', '/contact']) assert.equal(shouldTrack(p), true, p) })
t('payment and personal-data pages are NEVER tracked', () => {
  for (const p of ['/checkout', '/checkout/information', '/account', '/account/orders', '/order/12', '/login', '/register', '/api/auth/login'])
    assert.equal(shouldTrack(p), false, p)
})
t('trailing slashes and letter case cannot dodge the rule', () => { for (const p of ['/checkout/', '/Checkout', '/CHECKOUT/payment', '/account//']) assert.equal(shouldTrack(p), false, p) })
t('look-alike public paths are not over-blocked', () => { for (const p of ['/checkouts', '/ordering', '/accounting']) assert.equal(shouldTrack(p), true, p) })
t('missing pathname is not tracked', () => { assert.equal(shouldTrack(null), false); assert.equal(shouldTrack(undefined), false); assert.equal(shouldTrack(''), false) })
t('beforeSend keeps events from public pages unchanged', () => {
  const e = { type: 'pageview', url: 'https://shop.example/shop?x=1' }
  assert.equal(filterAnalyticsEvent(e), e)
})
t('beforeSend drops events from sensitive pages, absolute or relative, with query strings', () => {
  for (const url of ['https://shop.example/checkout', 'https://shop.example/order/5?utm=a', '/account/orders', 'https://shop.example/login#x'])
    assert.equal(filterAnalyticsEvent({ url }), null, url)
})
t('beforeSend drops events with an unparseable url instead of throwing', () => assert.equal(filterAnalyticsEvent({ url: 'http://[bad' }), null))
console.log(`\n${n} checks passed`)
