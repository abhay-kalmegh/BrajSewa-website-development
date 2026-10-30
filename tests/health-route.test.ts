/** Run with:  npx tsx tests/health-route.test.ts */
import assert from 'node:assert/strict'
import { GET, dynamic } from '../app/api/health/route'

let n = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok  ', name) }

async function main() {
  let fetchCalls = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => { fetchCalls++; throw new Error('health check must not call the network') }) as typeof fetch
  try {
    const res = GET()
    await t('answers 200 with {"ok":true}', async () => { assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true }) })
    await t('is never cached by a proxy or CDN', () => assert.equal(res.headers.get('cache-control'), 'no-store'))
    await t('is rendered per request, not statically at build time', () => assert.equal(dynamic, 'force-dynamic'))
    await t('does not depend on Django or any other network call', () => assert.equal(fetchCalls, 0))
  } finally {
    globalThis.fetch = realFetch
  }
  console.log(`\n${n} checks passed`)
}
main()
