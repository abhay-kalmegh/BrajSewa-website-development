/**
 * Run with:  npx tsx tests/cart-logic.test.ts
 * Pure logic only (no React, no network), so it needs nothing but tsx.
 */
import assert from 'node:assert/strict'
import { lineKeyFor, parseStoredCart, reconcile, signatureOf, itemFromQuoteLine, type CartProduct } from '../lib/cart-logic'
import { shippingFor, formatINR, orderNumber } from '../lib/pricing'
import type { CartQuote, QuoteLine } from '../lib/types'

let passed = 0
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok  ', name) }

const line = (over: Partial<QuoteLine> & { productId: number }): QuoteLine => ({
  slug: `p${over.productId}`, name: `Product ${over.productId}`, image: '/x.webp', pricePaise: 10_000,
  quantity: 1, requestedQuantity: 1, inventory: 10, issue: null, ...over,
})
const quote = (...lines: QuoteLine[]): CartQuote => ({ lines, subtotalPaise: 0, shippingPaise: 0, totalPaise: 0 })
const item = (over: Partial<CartProduct> & { productId: number }): CartProduct => ({
  lineKey: `p${over.productId}`, id: `p${over.productId}`, name: `Product ${over.productId}`, price: 100, image: '/x.webp', quantity: 1, ...over,
})

// --- variants
test('variant keys ignore option order and treat {} like none', () => {
  assert.equal(lineKeyFor('a', { size: 'S', color: 'red' }), lineKeyFor('a', { color: 'red', size: 'S' }))
  assert.equal(lineKeyFor('a', {}), 'a')
  assert.notEqual(lineKeyFor('a', { size: 'S' }), lineKeyFor('a', { size: 'M' }))
})

// --- stored cart parsing
test('stored carts from the old format (no productId) are dropped, not crashed on', () => {
  const legacy = JSON.stringify([{ id: 'tulsi', name: 'Tulsi', price: 299, image: '/a', quantity: 2 }])
  assert.deepEqual(parseStoredCart(legacy), [])
})
test('stored cart: garbage, non-arrays and bad entries are ignored', () => {
  assert.deepEqual(parseStoredCart(null), [])
  assert.deepEqual(parseStoredCart('not json'), [])
  assert.deepEqual(parseStoredCart('{"a":1}'), [])
  assert.equal(parseStoredCart(JSON.stringify([null, 5, { id: 1 }, item({ productId: 1 })])).length, 1)
})
test('stored cart: duplicates merge and quantities are clamped to 1..20', () => {
  const raw = JSON.stringify([item({ productId: 1, quantity: 15 }), item({ productId: 1, quantity: 15 }), item({ productId: 2, quantity: -3 }), item({ productId: 3, quantity: 2.9 })])
  const result = parseStoredCart(raw)
  assert.deepEqual(result.map((l) => [l.productId, l.quantity]), [[1, 20], [2, 1], [3, 2]])
})

// --- reconcile (what the server said vs what the browser had)
test('reconcile: no change when the server agrees', () => {
  const items = [item({ productId: 1, price: 100, quantity: 2, maxQuantity: 10 })]
  const r = reconcile(items, quote(line({ productId: 1, pricePaise: 10_000, quantity: 2, requestedQuantity: 2, inventory: 10, name: 'Product 1' })))
  assert.equal(r.changed, false)
  assert.deepEqual(r.notices, [])
})
test('reconcile: price change updates the line and tells the customer', () => {
  const r = reconcile([item({ productId: 1, price: 100, quantity: 1 })], quote(line({ productId: 1, pricePaise: 12_500, quantity: 1, name: 'Product 1' })))
  assert.equal(r.items[0].price, 125)
  assert.equal(r.changed, true)
  assert.match(r.notices[0], /price of Product 1 has changed/)
})
test('reconcile: unavailable and out-of-stock products are removed with a message', () => {
  const r = reconcile([item({ productId: 1 }), item({ productId: 2 }), item({ productId: 3 })], quote(
    line({ productId: 1, issue: 'unavailable', quantity: 0, slug: null, name: null }),
    line({ productId: 2, issue: 'out_of_stock', quantity: 0, inventory: 0 }),
    line({ productId: 3 })))
  assert.deepEqual(r.items.map((l) => l.productId), [3])
  assert.equal(r.notices.length, 2)
  assert.ok(r.notices.some((n) => /no longer available/.test(n)))
  assert.ok(r.notices.some((n) => /out of stock/.test(n)))
})
test('reconcile: quantity is capped at stock', () => {
  const r = reconcile([item({ productId: 1, quantity: 5 })], quote(line({ productId: 1, quantity: 3, requestedQuantity: 5, inventory: 3, issue: 'reduced' })))
  assert.equal(r.items[0].quantity, 3)
  assert.match(r.notices[0], /Only 3 of Product 1 are in stock/)
})
test('reconcile: stock is shared across variant lines of the same product', () => {
  const items = [item({ productId: 1, lineKey: 'p1?size=S', quantity: 2, options: { size: 'S' } }), item({ productId: 1, lineKey: 'p1?size=M', quantity: 2, options: { size: 'M' } })]
  const r = reconcile(items, quote(line({ productId: 1, quantity: 3, requestedQuantity: 4, inventory: 3, issue: 'reduced' })))
  assert.deepEqual(r.items.map((l) => l.quantity), [2, 1]) // 3 in stock: first line keeps 2, second gets the last 1
})
test('reconcile converges: applying the result again changes nothing', () => {
  const server = quote(line({ productId: 1, pricePaise: 9_900, quantity: 2, requestedQuantity: 5, inventory: 2, issue: 'reduced', name: 'Product 1' }))
  const first = reconcile([item({ productId: 1, quantity: 5 })], server)
  const second = reconcile(first.items, server)
  assert.equal(second.changed, false) // otherwise the sync effect would loop forever
})

// --- signature (guards against showing totals for a different cart)
test('signature identifies product+quantity sets regardless of order', () => {
  assert.equal(signatureOf([item({ productId: 2, quantity: 1 }), item({ productId: 1, quantity: 3 })]), signatureOf([item({ productId: 1, quantity: 3 }), item({ productId: 2, quantity: 1 })]))
  assert.notEqual(signatureOf([item({ productId: 1, quantity: 3 })]), signatureOf([item({ productId: 1, quantity: 4 })]))
})

// --- merging a server cart on login
test('server quote lines become cart lines; unavailable ones are skipped', () => {
  assert.equal(itemFromQuoteLine(line({ productId: 9, slug: null, quantity: 0, issue: 'unavailable' })), null)
  const made = itemFromQuoteLine(line({ productId: 9, slug: 'kapoor', quantity: 2, pricePaise: 9_900, inventory: 7 }))
  assert.deepEqual([made?.id, made?.lineKey, made?.price, made?.maxQuantity], ['kapoor', 'kapoor', 99, 7])
})

// --- display helpers (must mirror backend/shop/pricing.py)
test('shipping estimate mirrors the backend rule', () => {
  assert.equal(shippingFor(0), 0)
  assert.equal(shippingFor(29_900), 4_900)
  assert.equal(shippingFor(49_899), 4_900)
  assert.equal(shippingFor(49_900), 0)
})
test('formatting', () => {
  assert.equal(formatINR(34_800), '₹348')
  assert.equal(formatINR(123_456), '₹1,234.56')
  assert.equal(orderNumber(42), 'BS-000042')
})

console.log(`\n${passed} tests passed`)
