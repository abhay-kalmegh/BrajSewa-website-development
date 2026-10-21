/** Run with:  npx tsx tests/request-id.test.ts */
import assert from 'node:assert/strict'
import { ensureRequestId, requestIdFor } from '../lib/api/request-id'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
let counter = 0
const gen = () => `generated-${++counter}`

t('a well-formed id is kept', () => assert.equal(ensureRequestId('abc-123.DEF_9', gen), 'abc-123.DEF_9'))
t('missing, empty and undefined ids are generated', () => {
  assert.match(ensureRequestId(null, gen), /^generated-/); assert.match(ensureRequestId('', gen), /^generated-/); assert.match(ensureRequestId(undefined, gen), /^generated-/)
})
t('hostile ids are replaced (newline, space, markup, too long)', () => {
  for (const bad of ['x\nINFO forged', 'has space', '<script>', 'a'.repeat(65), 'semi;colon', '\r\n'])
    assert.match(ensureRequestId(bad, gen), /^generated-/, JSON.stringify(bad))
})
t('the default generator produces a UUID', () => assert.match(ensureRequestId(undefined), /^[0-9a-f-]{36}$/))
t('requestIdFor is stable for one Request (refresh + retry share an id)', () => {
  const req = new Request('https://x.test/api/proxy/orders/', { headers: { 'x-request-id': 'from-edge-1' } })
  assert.equal(requestIdFor(req, gen), 'from-edge-1'); assert.equal(requestIdFor(req, gen), 'from-edge-1')
})
t('requestIdFor generates once per Request when none is supplied', () => {
  const req = new Request('https://x.test/')
  const first = requestIdFor(req, gen)
  assert.equal(requestIdFor(req, gen), first)
  assert.notEqual(requestIdFor(new Request('https://x.test/'), gen), first)
})
t('no request: still returns a valid id', () => assert.match(requestIdFor(undefined, gen), /^generated-/))
console.log(`\n${n} checks passed`)
