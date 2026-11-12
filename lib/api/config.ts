export const BACKEND_API_PREFIX = '/api/v1'
export const API_REQUEST_TIMEOUT_MS = 60_000
export const API_SLOW_REQUEST_MS = 5_000
export const API_MAX_RETRIES = 1
export const API_RETRY_DELAY_MS = 250

const BACKEND_URL_ENV = 'API_INTERNAL_URL'
const LEGACY_BACKEND_URL_ENV = 'NEXT_PUBLIC_API_URL'

function configuredBackendBaseUrl() {
  const configuredUrl = process.env[BACKEND_URL_ENV]?.trim() || process.env[LEGACY_BACKEND_URL_ENV]?.trim()
  if (!configuredUrl) throw new Error(`${BACKEND_URL_ENV} is not configured`)

  let parsed: URL
  try {
    parsed = new URL(configuredUrl)
  } catch {
    throw new Error(`${BACKEND_URL_ENV} must be an absolute HTTP(S) URL`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${BACKEND_URL_ENV} must be an absolute HTTP(S) URL without credentials, query, or fragment`)
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`${BACKEND_URL_ENV} must use HTTPS in production`)
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

function assertBackendPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new TypeError('Backend paths must be origin-relative paths.')
  }

  const pathname = path.split(/[?#]/, 1)[0]
  for (const segment of pathname.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new TypeError('Backend paths must contain valid URL encoding.')
    }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      throw new TypeError('Backend paths cannot contain traversal segments.')
    }
  }
}

export function backendUrl(path: string) {
  assertBackendPath(path)
  return `${configuredBackendBaseUrl()}${path}`
}

export function djangoApiUrl(path: string) {
  assertBackendPath(path)
  return backendUrl(`${BACKEND_API_PREFIX}${path}`)
}
