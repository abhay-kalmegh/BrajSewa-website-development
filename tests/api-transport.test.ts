import assert from 'node:assert/strict'
import { fetchWithTimeoutAndRetry } from '../lib/api/transport'

async function main() {
  const originalFetch = globalThis.fetch
  let attempts = 0

  try {
    globalThis.fetch = (async () => {
      attempts += 1
      throw new Error('network unavailable')
    }) as typeof fetch

    await assert.rejects(fetchWithTimeoutAndRetry('https://backend.example.test/resource', { method: 'GET' }, { retryDelayMs: 0 }))
    assert.equal(attempts, 2, 'idempotent GET requests receive one retry')

    attempts = 0
    await assert.rejects(fetchWithTimeoutAndRetry('https://backend.example.test/orders/', { method: 'POST' }, { retryDelayMs: 0 }))
    assert.equal(attempts, 1, 'mutating POST requests are not retried')

    attempts = 0
    await assert.rejects(fetchWithTimeoutAndRetry(new Request('https://backend.example.test/orders/', { method: 'POST' }), {}, { retryDelayMs: 0 }))
    assert.equal(attempts, 1, 'a POST Request object is not retried when init.method is omitted')

    attempts = 0
    globalThis.fetch = (async () => {
      attempts += 1
      return new Response('temporarily unavailable', { status: 503 })
    }) as typeof fetch
    const response = await fetchWithTimeoutAndRetry('https://backend.example.test/resource', { method: 'GET' }, { retryDelayMs: 0 })
    assert.equal(response.status, 503)
    assert.equal(attempts, 1, 'HTTP responses are returned without an unsafe transport retry')

    console.log('4 API transport checks passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main()
