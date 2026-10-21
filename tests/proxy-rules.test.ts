/** Run with:  npx tsx tests/proxy-rules.test.ts */
import assert from 'node:assert/strict'
import { ALLOWED, MAX_BODY_BYTES, declaredTooLarge, matchRule, readTextLimited } from '../lib/api/proxy-rules'

let n = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok  ', name) }
const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request('https://x.test/api/proxy/orders/', { method: 'POST', body, headers })

async function main() {
  // ---- routing -----------------------------------------------------------------------------------------------
  await t('every storefront route is reachable with the right method', () => {
    for (const [path, method] of [['cart/quote', 'POST'], ['cart/merge', 'POST'], ['cart', 'GET'], ['cart', 'PUT'], ['orders', 'GET'], ['orders', 'POST'],
      ['orders/12', 'GET'], ['payments/razorpay/verify', 'POST'], ['account/me', 'GET']] as const)
      assert.ok(matchRule(path.split('/'), method), `${method} ${path}`)
  })
  await t('only the quote route is usable without a session', () => {
    assert.equal(matchRule(['cart', 'quote'], 'POST')?.rule.public, true)
    for (const p of [['cart'], ['cart', 'merge'], ['orders'], ['account', 'me']]) assert.notEqual(matchRule(p, p[0] === 'cart' && p.length === 1 ? 'GET' : p[1] === 'merge' ? 'POST' : 'GET')?.rule.public, true, p.join('/'))
  })
  await t('the seller endpoints are no longer exposed', () => {
    for (const m of ['GET', 'POST']) assert.equal(matchRule(['seller', 'products'], m), null)
    assert.ok(!ALLOWED.some((r) => r.prefix.startsWith('seller')))
  })
  await t('wrong methods are refused', () => {
    assert.equal(matchRule(['cart', 'quote'], 'GET'), null); assert.equal(matchRule(['orders'], 'DELETE'), null)
    assert.equal(matchRule(['account', 'me'], 'POST'), null); assert.equal(matchRule(['payments', 'razorpay', 'verify'], 'GET'), null)
  })
  await t('unknown paths are refused, including Django routes never meant for the browser', () => {
    for (const p of [['admin'], ['auth', 'token'], ['payments', 'razorpay', 'webhook'], ['products'], ['seller']]) assert.equal(matchRule(p, 'GET'), null, p.join('/'))
  })
  await t('traversal and odd segments are refused', () => {
    for (const p of [['..', 'admin'], ['.', 'orders'], ['orders', '..', 'admin'], [''], [], ['orders', '%2e%2e'], ['orders', 'a/b'], ['or ders'], ['orders', '1;2'], ['orders\n'], ['ords', '\u0661']])
      assert.equal(matchRule(p, 'GET'), null, JSON.stringify(p))
  })

  // ---- body size ---------------------------------------------------------------------------------------------
  await t('declared size: over the limit is refused, at the limit is fine', () => {
    assert.equal(declaredTooLarge(String(MAX_BODY_BYTES + 1)), true); assert.equal(declaredTooLarge(String(MAX_BODY_BYTES)), false); assert.equal(declaredTooLarge('10'), false)
  })
  await t('unknown or malformed Content-Length defers to the streaming limit', () => { for (const h of [null, '', 'abc', '-5', '1.5']) assert.equal(declaredTooLarge(h), false, String(h)) })
  await t('a normal body is returned intact (including non-ASCII)', async () => assert.equal(await readTextLimited(post('{"lines":[],"name":"नमस्ते"}')), '{"lines":[],"name":"नमस्ते"}'))
  await t('an empty body reads as an empty string', async () => assert.equal(await readTextLimited(new Request('https://x.test/', { method: 'GET' })), ''))
  await t('a body of exactly the limit is accepted', async () => assert.equal((await readTextLimited(post('x'.repeat(100)), 100))?.length, 100))
  await t('one byte over the limit is refused', async () => assert.equal(await readTextLimited(post('x'.repeat(101)), 100), null))
  await t('a lying Content-Length cannot sneak a large body past the limit', async () => {
    const req = post('x'.repeat(5000), { 'content-length': '10' })
    assert.equal(await readTextLimited(req, 100), null)
  })
  await t('a streamed (chunked, no Content-Length) body is cut off as soon as it exceeds the limit', async () => {
    let produced = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) { produced += 50; controller.enqueue(new Uint8Array(50)); if (produced > 100000) controller.close() } })
    const req = new Request('https://x.test/', { method: 'POST', body, duplex: 'half' } as RequestInit)
    assert.equal(await readTextLimited(req, 100), null)
    assert.ok(produced < 2000, `kept reading after the limit (${produced} bytes produced)`)
  })
  console.log(`\n${n} checks passed`)
}
main()
