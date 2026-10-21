/**
 * Third-party scripts have no business on pages that handle payment or personal data: a compromised analytics vendor
 * could read what the customer types (the classic card-skimming route). Pages under these prefixes are never tracked.
 */
const SENSITIVE_PREFIXES = ['/checkout', '/account', '/order', '/login', '/register', '/api']

export function shouldTrack(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  return !SENSITIVE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** For analytics libraries' `beforeSend` hook: drop any event whose URL is a sensitive page. */
export function filterAnalyticsEvent<T extends { url: string }>(event: T): T | null {
  try {
    return shouldTrack(new URL(event.url, 'https://placeholder.invalid').pathname) ? event : null
  } catch {
    return null
  }
}
