import assert from 'node:assert/strict'
import { backendUrl, djangoApiUrl } from '../lib/api/config'

const originalEnvironment = {
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
}

try {
  process.env.API_INTERNAL_URL = 'https://internal.example.test/base/'
  process.env.NEXT_PUBLIC_API_URL = 'https://legacy.example.test'
  assert.equal(backendUrl('/readyz/'), 'https://internal.example.test/base/readyz/')
  assert.equal(djangoApiUrl('/products/'), 'https://internal.example.test/base/api/v1/products/')

  process.env.API_INTERNAL_URL = ''
  assert.equal(backendUrl('/healthz/'), 'https://legacy.example.test/healthz/')
  assert.throws(() => backendUrl('/../admin/'), /traversal/i)
  assert.throws(() => backendUrl('/%2e%2e/admin/'), /traversal/i)

  console.log('5 backend config checks passed')
} finally {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
