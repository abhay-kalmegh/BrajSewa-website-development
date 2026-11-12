import { API_MAX_RETRIES, API_REQUEST_TIMEOUT_MS, API_RETRY_DELAY_MS, API_SLOW_REQUEST_MS } from '@/lib/api/config'

type TransportHooks = {
  onSlowStart?: () => void
  onSlowEnd?: () => void
  retryDelayMs?: number
}

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'])
const BODYLESS_STATUSES = new Set([204, 205, 304])

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new Error('Request was aborted.')
}

function waitForRetry(delayMs: number, signal?: AbortSignal | null) {
  if (delayMs <= 0) return Promise.resolve()
  if (signal?.aborted) return Promise.reject(abortReason(signal))

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal ? abortReason(signal) : new Error('Request was aborted.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchCompleteResponse(input: RequestInfo | URL, init: RequestInit, signal: AbortSignal) {
  const response = await fetch(input, { ...init, signal })
  if (BODYLESS_STATUSES.has(response.status) || !response.body) return response

  const body = await response.arrayBuffer()
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** Shared end-to-end timeout and safe-method retry policy for browser and server-side API calls. */
export async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  hooks: TransportHooks = {},
): Promise<Response> {
  const requestMethod = init.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
  const method = requestMethod.toUpperCase()
  const maxAttempts = RETRYABLE_METHODS.has(method) ? API_MAX_RETRIES + 1 : 1
  const externalSignal = init.signal
  let slowStarted = false
  let lastError: unknown

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (externalSignal?.aborted) throw abortReason(externalSignal)

      const controller = new AbortController()
      const forwardAbort = () => controller.abort(externalSignal ? abortReason(externalSignal) : undefined)
      externalSignal?.addEventListener('abort', forwardAbort, { once: true })
      const slowTimer = setTimeout(() => {
        if (!slowStarted) {
          slowStarted = true
          hooks.onSlowStart?.()
        }
      }, API_SLOW_REQUEST_MS)
      const timeout = setTimeout(() => {
        const error = new Error(`Request timed out after ${API_REQUEST_TIMEOUT_MS}ms.`)
        error.name = 'TimeoutError'
        controller.abort(error)
      }, API_REQUEST_TIMEOUT_MS)

      try {
        return await fetchCompleteResponse(input, init, controller.signal)
      } catch (error) {
        lastError = error
        if (externalSignal?.aborted || attempt + 1 >= maxAttempts) throw error
        await waitForRetry(hooks.retryDelayMs ?? API_RETRY_DELAY_MS, externalSignal)
      } finally {
        clearTimeout(slowTimer)
        clearTimeout(timeout)
        externalSignal?.removeEventListener('abort', forwardAbort)
      }
    }

    throw lastError ?? new Error('The backend request failed.')
  } finally {
    if (slowStarted) hooks.onSlowEnd?.()
  }
}
