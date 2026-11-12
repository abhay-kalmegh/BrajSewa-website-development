import { fetchWithTimeoutAndRetry as fetchWithTransport } from '@/lib/api/transport'

export const API_REQUEST_STATUS_EVENT = 'brajsewa:api-request-status'

let activeSlowRequests = 0

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message)
    this.name = 'ApiError'
  }

  get fieldErrors(): Record<string, string[]> {
    const body = isRecord(this.body) ? this.body : null
    const source = body && isRecord(body.errors) ? body.errors : body
    if (!source) return {}

    const flattened: Record<string, string[]> = {}
    const collect = (value: unknown, prefix = '') => {
      if (!isRecord(value)) return
      for (const [field, messages] of Object.entries(value)) {
        if (field === 'detail' || field === 'code') continue
        const key = prefix ? `${prefix}.${field}` : field
        if (Array.isArray(messages)) {
          const text = messages.filter((message): message is string => typeof message === 'string')
          if (text.length) flattened[key] = text
        } else if (isRecord(messages)) {
          collect(messages, key)
        }
      }
    }

    collect(source)
    return flattened
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function messageFrom(body: unknown, fallback: string) {
  const findMessage = (value: unknown, depth = 0): string | null => {
    if (typeof value === 'string') return value
    if (depth >= 4 || value === null || typeof value !== 'object') return null
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const message = findMessage(child, depth + 1)
      if (message) return message
    }
    return null
  }

  const detail = isRecord(body) ? body.detail : null
  return (typeof detail === 'string' ? detail : findMessage(body)) ?? fallback
}

function dispatchSlowRequestCount() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_REQUEST_STATUS_EVENT, { detail: { activeCount: activeSlowRequests } }))
  }
}

const fetchWithTimeoutAndRetry = (input: string, init: RequestInit) =>
  fetchWithTransport(input, init, {
    onSlowStart: () => {
      activeSlowRequests += 1
      dispatchSlowRequestCount()
    },
    onSlowEnd: () => {
      activeSlowRequests = Math.max(0, activeSlowRequests - 1)
      dispatchSlowRequestCount()
    },
  })

// Forward a CSRF cookie if the backend has set one. No CSRF bootstrap URL is registered; the JWT BFF's same-origin
// guard and SameSite cookies remain the mutation defense, so the client does not invent a backend endpoint.
function readCsrfCookie() {
  if (typeof document === 'undefined') return null
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('csrftoken='))
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.slice('csrftoken='.length))
  } catch {
    return cookie.slice('csrftoken='.length)
  }
}

/** Browser requests stay on this origin; allowlisted Next.js routes handle the backend hop. */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('API paths must be relative to this application origin.')
  }

  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = readCsrfCookie()
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
  }

  try {
    const response = await fetchWithTimeoutAndRetry(path, {
      ...options,
      method,
      headers,
      credentials: 'include',
    })
    if (response.status === 204 || response.status === 205) return null as T

    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!response.ok) {
      throw new ApiError(messageFrom(body, `Request failed (${response.status})`), response.status, body)
    }

    return body as T
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      const requestPath = path.split('?')[0]
      const status = error instanceof ApiError ? error.status : undefined
      console.error('[api] request failed', { path: requestPath, status, message: error instanceof Error ? error.message : 'Unknown error' })
    }
    throw error
  }
}
